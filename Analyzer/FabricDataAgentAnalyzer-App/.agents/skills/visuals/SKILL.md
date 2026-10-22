---
name: visuals
description: >
  Use when user wants to incorporate charts, graphs, data grid, 
  or other visual representations of data into their project.
  Use VegaVisual and DataGrid components to create these visuals, 
  utilizing the shared DataTable input, formatting, theme, and interactivity.
  Covers the onInteraction selection/click events host apps consume, named
  multi-table data input for layered overlays and reference lines, and
  Vega-Lite native selections. Triggers: chart, graph, plot, dashboard, KPI,
  metric, trend, scorecard, data grid, visualize.
---

# Visuals

## Turn it on first

```sh
npm run pack:add -- visuals
```

That installs `@microsoft/fabric-visuals`, `@microsoft/fabric-visuals-core` and
`@microsoft/fabric-datagrid`, copies in `toDataTable`, and wires
`validate:visual`. Run it before writing any component that imports them — the
base app does not carry the visual packages, so the imports below do not resolve
until it is applied.

Re-applying is safe: an existing file is preserved, not overwritten.

Charting is all this pack does.
If the numbers come from a Power BI semantic model, add `analytics` as well and
read [`analytics`](../analytics/SKILL.md) — it owns the connection, the queries
and the semantic-model connector.
Charts over sample data or over records the app owns need no analytics pack.

## Types of visuals

There are 2 different types of visuals that can be used in a project:
1. Charts and Graphs: These are used to represent data in a visual format, such as bar charts, line charts, pie charts, etc. These are built using vega-lite, see [references/vega-lite-visual.md](references/vega-lite-visual.md) for more details.
2. Data Grids: These are used to display tabular data in a structured format, allowing for sorting, filtering, and pagination. See [references/data-grid-visual.md](references/data-grid-visual.md) for more details.

## Packages & Imports

The visual components are provided by three packages. **Always use these package imports when creating visuals.**

| Package | Primary exports | Example import |
|---|---|---|
| `@microsoft/fabric-visuals` | `VegaVisual`, types: `VisualizationSpec`, `VegaLiteConfig`, `VegaVisualProps` | `import { VegaVisual } from "@microsoft/fabric-visuals"` |
| `@microsoft/fabric-datagrid` | `DataGrid`, types: `GridColumnDef`, `Row`, `CellValue`, `DataGridProps`, `DataGridTheme`, `SortConfig` | `import { DataGrid } from "@microsoft/fabric-datagrid"` |
| `@microsoft/fabric-visuals-core` | `isDataTable`, `convertDataTableToRows`, design tokens | `import { isDataTable } from "@microsoft/fabric-visuals-core"` |

The `DataTable` type (used by both components) is defined in `@microsoft/fabric-visuals-core` and re-exported by the visual packages' type definitions.

## Data Format

The chart and data grid components share a unified `data` prop of type `DataTable` (from `@microsoft/fabric-visuals-core`). This structured format carries column metadata (`displayName`, `format`, `semanticType`) that the components use for axis titles, grid headers, number formatting, and tooltips.

**Using `DataTable`**: Pass a `DataTable` via the `data` prop. The visual uses its column metadata for formatting, axis titles, and tooltips.

**From a query result**: the pack copies in `toDataTable()` at
`packages/frontend/src/lib/to-data-table.ts`, which merges a query's table with the
`columnMetadata` its factory exports to produce a `DataTable`. Its parameter is
`QueryTableLike` — `{ columns: { name }[], rows }` — which the Fabric SDK's
`QueryTable` satisfies, so it accepts a semantic-model result without this pack
depending on the `analytics` one.

**Inline spec data — Vega-Lite only**: the `data` prop takes a `DataTable`
whatever the rows are, query results and static rows alike, and for `DataGrid` it
is the only option. A Vega-Lite spec additionally accepts its own
`data: { values: [...] }`, with the `data` prop omitted. That second form
discards the `DataTable` metadata — `displayName`, `format` and `semanticType` —
so axis titles and number formatting have to be part of the Vega-Lite spec; prefer the prop
whenever that metadata exists, which is normally the case for anything a query
returned.

**Multiple tables in one visual**: the `data` prop also accepts a `Record<string, DataTable>` for specs that bind separate layers to more than one dataset by name such as layered overlays, reference lines, and axis spines. See [references/multi-data-input.md](references/multi-data-input.md).

```tsx
import { VegaVisual, useCssTheme } from "@microsoft/fabric-visuals";
import type { VisualizationSpec } from "@microsoft/fabric-visuals";
import { DataGrid } from "@microsoft/fabric-datagrid";
import type { DataTable } from "@microsoft/fabric-visuals-core";

// useCssTheme() reads --color-* vars from the page and updates automatically
// when the theme changes (e.g. dark-mode toggle adds/removes the .dark class).
const theme = useCssTheme();

// Charts — pass a DataTable and Vega-Lite spec
<VegaVisual spec={vegaLiteSpec} data={dataTable} theme={theme} />

// Grids — displayName becomes column headers, format applies to cells
<DataGrid data={dataTable} theme={theme} />

// Inline spec data — Vega-Lite only, no data prop needed
const inlineSpec: VisualizationSpec = {
  data: { values: [{ x: 1, y: 2 }, { x: 3, y: 4 }] },
  mark: "point",
  encoding: { ... },
};

<VegaVisual spec={inlineSpec} theme={theme} />
```

**Type every spec you write**, with `VisualizationSpec` from
`@microsoft/fabric-visuals` — on the constant, or as `useMemo<VisualizationSpec>`
when it is built per render. Without the annotation the object widens (`type:
"nominal"` becomes `string`) and the compiler stops checking the parts that
matter. With it, build the spec however the chart needs — from a filter
selection, a theme token, whatever — and `npm run typecheck` still checks the
mark, encoding and field shapes.

`validate:visual` adds the published Vega-Lite schema on top, catching value
ranges the types do not (`opacity: 5`), plus a spec that resolves to no mark at
all. It can only read a spec whose values are literals, though; one assembled
from variables is reported with `status: "incomplete"` and `ok: false`, not as a
completed schema-validation pass.
The JSON report also carries `coverage: "none" | "partial" | "complete"`.
When runtime or computed specs exist and zero schemas were checked, the normal
`npm run validate:visual` gate exits nonzero.
Use `npm run validate:visual:preview` only for that narrow zero-static-spec case
to proceed to browser validation; actual failures still exit nonzero.
When at least one schema was checked but runtime or computed specs remain,
the report stays `status: "incomplete"` and `ok: false` but exits zero without
the preview flag.
That partial result still requires browser validation and is not a completed
visual-validation gate.
Where a spec is static anyway, leave it literal or put it in a `.json` under
`packages/frontend/src/queries/` to get the schema check.
Where it genuinely varies at runtime, record the rendered browser check required
by [`app-validation`](../app-validation/SKILL.md) before calling the visual
complete.
Missing, unreadable, invalid, or uncompilable Vega-Lite/AJV tooling is a failed
install, not incomplete coverage.
Restore the visuals pack dependencies; the preview flag never bypasses it.

For the `DataTable` schema and `ColumnDef` fields, see [references/data-table.md](references/data-table.md).

## Formatting & Theme

- **Formatting rules**: Number formatting, color palettes, chart-specific encoding rules, highlighting guidelines, and a default theme. See [references/formatting.md](references/formatting.md).

## Custom visuals

Always use the above mentioned ways to create visual when possible. If the user's request doesn't allow creation using the above methods, ask the user if they are ok with using another library for creating the visual. If they are ok with it, use the library to create the visual. If they are not ok with it, then build that visual from scratch using HTML, CSS, and JS/TS. Make sure to ask the user for any specific requirements they have for the visual, such as colors, labels, etc.

## Container Layout

- **`DataGrid`** — the direct parent must apply `overflow-auto` so content remains scrollable when it exceeds the container bounds (many rows).

## Interactivity

Both `VegaVisual` and `DataGrid` expose an `onInteraction` prop that emits structured, predicate-based events when the user clicks a data point or row.

**Always use the `onInteraction` prop** on `VegaVisual` and `DataGrid` to surface user selections. The component only emits the selection; the host app decides what it does — e.g. coordinating other visuals or queries on the page.

> A visual renders a layered subset by binding two named datasets to two layers (`data={{ all, highlighted }}`) — see [references/multi-data-input.md](references/multi-data-input.md). The component renders whatever tables it is handed.

```tsx
import type { InteractionEvent } from "@microsoft/fabric-visuals-core";

function handleInteraction(source: string, events: InteractionEvent[]) {
    for (const event of events) {
        if (event.action === "select") {
            // event.selections describes the clicked data as predicates
        } else if (event.action === "clear") {
            // user deselected (re-clicked same item or clicked empty space)
        }
    }
}

<VegaVisual spec={spec} data={dataTable} theme={theme}
    onInteraction={(events) => handleInteraction("salesChart", events)} />
<DataGrid data={dataTable} theme={theme}
    onInteraction={(events) => handleInteraction("detailTable", events)} />
```

**Key concepts**:
- Clicking a different data point emits a new `select` (replaces the prior selection — no preceding `clear`).
- Re-clicking the same item or background space in a vega-lite visual emits `clear`.
- Predicates include all fields from the datum; consumers filter to the ones that are relevant to them.
