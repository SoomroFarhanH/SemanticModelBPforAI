# Multi-Grain Patterns

When a component needs data at multiple grains (e.g., region detail + grand total, monthly trend + YTD), use separate `.dax` files and separate hook calls.

## Contents

- [File Organization](#file-organization) — `.dax` + `.ts` layout per visualization
- [DAX Query Shapes](#dax-query-shapes) — separate detail and one-row summary queries
- [Rendering in VegaVisual (multi-DataTable)](#rendering-in-vegavisual-multi-datatable) — pass named datasets, layer in spec
- [Rendering in DataGrid (provided grand total)](#rendering-in-datagrid-provided-grand-total) — pass the summary `DataTable` through `grandTotals`
- [Consistency Rule](#consistency-rule) — shared filters, measures, scope across split-grain queries

## File Organization

```text
packages/frontend/src/queries/sales/
├── revenue-by-region.dax          # Detail grain
├── revenue-by-region.json         # Vega-Lite spec (layers both datasets)
├── revenue-by-region.ts           # Factory: returns detailQuery + vegaLiteSpec
├── revenue-total.dax              # Summary grain (single-row total)
├── revenue-total.ts               # Factory: returns totalQuery (no spec needed)
└── index.ts
```

## DAX Query Shapes

Keep the detail and summary grains in separate query files.

**Detail query:**

```dax
EVALUATE
  SUMMARIZECOLUMNS(
    'Region'[Name],
    "Revenue", [Total Revenue],
    "Customer Count", DISTINCTCOUNT('Sales'[Customer Key])
  )
ORDER BY 'Region'[Name]
```

**Summary query:**

```dax
EVALUATE
  ROW(
    "Revenue", [Total Revenue],
    "Customer Count", DISTINCTCOUNT('Sales'[Customer Key])
  )
```

The `Customer Count` grand total must come from the summary query. Summing the per-region distinct counts would double-count customers that appear in multiple regions.

As with detail data, copy the semantic model's format strings into the summary factory's `columnMetadata`; `toDataTable()` places them on the `DataTable`:

```typescript
const columnMetadata: ColumnMetadataMap = {
  "[Revenue]": { name: "Revenue", displayName: "Revenue", format: "$#,##0.00" },
  "[Customer Count]": { name: "Customer Count", displayName: "Customer Count", format: "#,##0" },
};
```

## Rendering in VegaVisual (multi-DataTable)

Use two hook calls and pass both tables as named datasets. The spec references each by name, so no TypeScript stitching is needed:

```typescript
// Two hook calls, two DataTables. Both factories target the same model,
// so the two connection objects are equivalent — we destructure both
// (factory signature requires it) but use one for both hooks.
const { connection, query: detailQuery, columnMetadata: detailMeta, vegaLiteSpec } = revenueByRegion();
const { connection: _summaryConn, query: totalQuery, columnMetadata: totalMeta } = revenueTotal();

const detail = useSemanticModelQuery({ connection, query: detailQuery });
const summary = useSemanticModelQuery({ connection, query: totalQuery });

// After handling both hooks' loading and error states:
const detailTable = toDataTable(detail.data.table, detailMeta);
const summaryTable = toDataTable(summary.data.table, totalMeta);
```

```tsx
<VegaVisual
  spec={vegaLiteSpec}
  data={{ detail: detailTable, summary: summaryTable }}
  theme={theme}
/>
```

The Vega-Lite spec (in the `.json` file) layers the two datasets:

```json
{
  "layer": [
    {
      "data": { "name": "detail" },
      "mark": "bar",
      "encoding": {
        "x": { "field": "RegionName", "type": "nominal" },
        "y": { "field": "Revenue", "type": "quantitative" }
      }
    },
    {
      "data": { "name": "summary" },
      "mark": { "type": "rule", "color": "firebrick", "strokeDash": [4, 4] },
      "encoding": {
        "y": { "field": "Revenue", "type": "quantitative" }
      }
    }
  ]
}
```

This pattern works for: reference lines (average, target), cross-highlighting between datasets, annotations on top of detail data.

## Rendering in DataGrid (provided grand total)

Pass the detail and one-row summary tables separately. DataGrid owns grand-total rendering; do not append the summary to the body rows or use `cellRenderer` for the totals row.

DataGrid filtering is enabled by default. Derive the summary query from grid filter state so the provided total matches the visible rows:

```tsx
import type { CellValue } from "@microsoft/fabric-datagrid";

const [gridFilters, setGridFilters] = useState<Record<string, CellValue[]>>({});
const { query: totalQuery, columnMetadata: totalMeta } = revenueTotal({ filters: gridFilters });
const summary = useSemanticModelQuery({ connection, query: totalQuery });

if (summary.error) return <ErrorMessage message={summary.error.message} />;

const filteredSummaryTable =
  !summary.isLoading &&
  summary.data?.status === "success"
    ? toDataTable(summary.data.table, totalMeta)
    : undefined;
```

```tsx
<DataGrid
  data={detailTable}
  grandTotals={{ position: "bottom", data: filteredSummaryTable }}
  onFilterChange={(columnId, selectedValues) =>
    setGridFilters((current) => ({ ...current, [columnId]: selectedValues }))
  }
  theme={theme}
/>
```

Changing `gridFilters` re-queries the summary while DataGrid filters detail rows locally. The summary factory must translate each filterable column ID to its DAX predicate rather than interpolate column IDs directly. See the visuals skill's [DataGrid reference](../../visuals/references/data-grid-visual.md#grand-totals).

## Consistency Rule

When splitting a visualization across multiple queries, all queries must share the same semantic contract:

- Same measures and application-level DAX filters; derive both queries from the same inputs
- Local DataGrid filters remain enabled; pass `onFilterChange` selections to the summary factory so the provided total matches the visible rows
- Summary metadata names match the detail table and include formats
- Use `ROW(...)` for the summary so it returns exactly one row and preserves BLANK values; `SUMMARIZECOLUMNS` can return zero rows when all measures are BLANK

Each `useSemanticModelQuery` call is a separate SDK round trip, and every local filter change re-executes the summary query.
