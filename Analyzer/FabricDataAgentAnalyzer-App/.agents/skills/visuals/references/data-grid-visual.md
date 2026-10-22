# DataGrid

A React component from the `@microsoft/fabric-datagrid` package for rendering data-grid / table visuals.

## Props

Refer to the package README.md for the complete component API. This reference covers the DataGrid patterns and constraints needed when building the template.

## Grand Totals

Actively evaluate a grand-total row whenever a DataGrid contains aggregated numeric columns. Prefer including one when it adds useful context. Omit totals only when aggregation would be meaningless or misleading.

Use the `grandTotals` prop instead of appending a total to the body data or styling one with `cellRenderer`.

```tsx
// Provided totals
<DataGrid
  data={dataTable}
  grandTotals={{ position: "bottom", data: totalsDataTable }}
  onFilterChange={handleFilterChange}
  theme={theme}
/>

// Computed totals
<DataGrid
  data={dataTable}
  grandTotals={{ position: "bottom" }}
  theme={theme}
/>
```

- **Provided mode:** Pass a `DataTable` through `grandTotals.data`. When `data` is `undefined`, DataGrid uses computed mode; without a supported body-column aggregation, no totals row renders. A supplied table must contain exactly one row or DataGrid throws.
- **Computed mode:** Omit `grandTotals.data` and set `defaultAggregation` on body columns. DataGrid currently honors only `"sum"` and `"count"`.
- **Filtering:** DataGrid filtering is enabled by default, but provided totals do not update automatically. Use `onFilterChange` to re-query the summary.
- **Mapping and formatting:** Provided values map by `ColumnDef.name` and use the provided table's column formats.
- **Label:** DataGrid displays `Total` by default. To override it, set the provided totals row's first leaf-column value; DataGrid displays that value instead.

For provided DAX totals, use a one-row summary query with the same filter context as the visible detail rows. See the query-design skill's [multi-grain pattern](../../query-design/references/multi-grain-patterns.md).

## Theming

Pass the `theme` prop to render correctly in both light and dark modes. Use the `useCssTheme()` hook from `@microsoft/fabric-visuals` — it derives the theme from `--color-*` CSS variables on the page and updates automatically when the theme changes:

```tsx
import { useCssTheme } from "@microsoft/fabric-visuals";

const theme = useCssTheme();

<DataGrid data={dataTable} theme={theme} />
```

## Custom Cell Rendering

**Key behaviors:**

- When `cellRenderer` is set, the column's `format` string is **not** applied — the renderer receives the raw value and is responsible for its own formatting.
- The built-in tooltip-on-truncation is disabled for custom-rendered cells — the renderer should provide its own tooltip if needed.
- Every `GridColumnDef.id` must correspond to a column in the `DataTable`.

### Examples

**Data bar** — visualize a numeric value as a progress bar, scaled to the column's maximum:

```tsx
{
  id: "revenue",
  header: "Revenue",
  cellRenderer: (value) => {
    const maxValue = 100000; // set to the column's known maximum
    const num = typeof value === "number" ? value : 0;
    const pct = Math.min((num / maxValue) * 100, 100);
    return (
      <div className="flex items-center gap-200">
        <div className="h-200 w-full rounded-full bg-muted">
          <div
            className="h-200 rounded-full bg-primary"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-200 tabular-nums">{num}</span>
      </div>
    );
  },
}
```

**Combining row fields** — use the second `row` parameter to build content from multiple columns:

```tsx
{
  id: "name",
  header: "Employee",
  cellRenderer: (value, row) => {
    const name = String(value ?? "");
    const role = String(row["role"] ?? "");
    return (
      <div className="flex flex-col leading-tight">
        <span className="font-medium">{name}</span>
        <span className="text-200 text-muted-foreground">{role}</span>
      </div>
    );
  },
}
```

**Boolean indicator** — render a check/cross icon instead of "true"/"false":

```tsx
import { Check, X } from "lucide-react";

{
  id: "verified",
  header: "Verified",
  cellRenderer: (value) =>
    value ? <Check className="icon-size-200 text-green-600" /> : <X className="icon-size-200 text-red-500" />,
}
```

**Clickable URL** — use when the column value is a URL the user should navigate to (e.g. a reference link, document, or external page). Renders as clickable text:

```tsx
{
  id: "website",
  header: "Website",
  cellRenderer: (value) => {
    const href = typeof value === "string" ? value : "";
    return href ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-foreground underline">
        {href}
      </a>
    ) : null;
  },
}
```

**Image cell** — use when the column value is a URL pointing to an image meant for visual display (e.g. a photo, avatar, or product image). Renders a thumbnail; clicking opens a lightbox overlay. Use `ImageCell` from `@microsoft/fabric-datagrid`:

```tsx
import { ImageCell } from "@microsoft/fabric-datagrid";

{
  id: "photo",
  header: "Photo",
  cellRenderer: (value) => {
    const src = typeof value === "string" ? value : "";
    return src ? <ImageCell src={src} alt="Photo" /> : null;
  },
}
```

**Cell tooltip** — use `CellTooltip` when a `cellRenderer` needs a tooltip:

```tsx
import { CellTooltip } from "@microsoft/fabric-datagrid";

{
  id: "name",
  header: "Name",
  cellRenderer: (value, row) => {
    const name = String(value ?? "");
    const detail = String(row["email"] ?? "");
    return (
      <CellTooltip content={<div className="rounded-xl border bg-popover p-400 shadow-lg"><p>{name}</p><p>{detail}</p></div>}>
        <span>{name}</span>
      </CellTooltip>
    );
  },
}
```
