---
name: fabric-sdk
description: >
  How to query Fabric data from a running app through the Rayfin connectors
  client. Use getRayfinClient().connectors.<name>.executeQuery to run DAX
  against a semantic model, and toQueryResult to normalize the response.
---

# Fabric Data Access at Runtime

## Overview

The app reaches Fabric through the Rayfin connectors client. Each connector
is declared in `rayfin.yml` and surfaced as
`getRayfinClient().connectors.<name>`, with operations typed by the connector
marker package.

The connector's `workspaceId` and `itemId` are injected server-side from
`rayfin.yml`. The app sends only the query, so no ids reach the bundle and
there is no generated config to keep in sync.

## Quick Start

Prefer the hook. It normalizes the response and never throws — but it reports
failures on two channels, so check `error` as well as `data.status`:

```typescript
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";

const { data, isLoading, error, refetch } = useSemanticModelQuery({
  connection: "sales",
  query: 'EVALUATE SUMMARIZECOLUMNS(Product[Category], "Total", [Sales Amount])',
});

if (error) {
  // The connector threw: transport, auth, or server failure.
  // `data` is undefined here, so checking only data.status renders nothing.
  // error.message
} else if (data?.status === "success") {
  // data.table.columns — [{ name, dataType }]
  // data.table.rows    — unknown[][]
} else if (data?.status === "error") {
  // The query reached Power BI and failed there.
  // data.error.category — "api" | "query" | "network" | "overflow" | "unknown"
  // data.error.message
}
```

Drop to the client only when you need something the hook does not expose:

```typescript
import { toQueryResult } from "@microsoft/rayfin-connector-fabric-semanticmodel";
import { getRayfinClient } from "@/lib/rayfin-client";

// `getRayfinClient` is async in this template, so await it into a variable
// first — `await client().connectors` would read `.connectors` off the Promise.
const client = await getRayfinClient();
const response = await client.connectors.sales.executeQuery({
  query: "EVALUATE ...",
});
const result = toQueryResult(response);
```

## Key Concepts

### Declaring connectors

Connectors come from `rayfin/rayfin.yml`, managed by `rayfin connector add`. See
`AGENTS.md` to register one, and the `rayfin-connectors` skill that `add`
installs for the YAML schema. `AppConnectorsSchema` in
`packages/frontend/src/lib/connectors.ts` types the names; it accepts any string
by default, so adding a connector needs no code change.

### Querying

One operation for DAX:

```typescript
const client = await getRayfinClient();
await client.connectors[name].executeQuery({ query });
```

Each query must contain exactly one `EVALUATE` statement.

### Bounding rows

There is no default row cap, so bound the DAX with an aggregation or `TOPN(...)`.

The connector's `executeQuery` will also accept an optional
`resultSetRowCountLimit` alongside `query`. Prefer that over `TOPN(...)` when you
want a guard rather than a deliberately ranked subset: exceeding it fails the
query with an `overflow` error, so a truncated result announces itself, where
`TOPN` returns a complete-looking partial answer.

`useSemanticModelQuery` does not forward the field, so from app code shape the
DAX itself. The CLI's `invoke` accepts it.

### The connector throws, the hook does not

This is the one behavior that trips people up.

`executeQuery` **throws** on wiring, transport, auth, and server failures. A
query that reaches Power BI and fails there does not throw; it resolves with the
error nested in the response body.

`useSemanticModelQuery` catches the throw rather than re-throwing, and keeps the
two **disjoint**, so a hook caller has two channels and each is reachable:

- `error` — what was thrown, surfaced as-is so its status and service code
  survive. `data` is cleared when this is set.
- `data.status === "error"` — what Power BI returned, already categorised.
  `error` stays `undefined` for these.

A component that checks only one renders nothing for half its failures. Check
both — the order does not matter, because they never both apply:

```tsx
if (error) return <Error message={error.message} />;
if (data?.status === "error") return <Error message={data.error.message} />;
if (isLoading || !data) return <Spinner />;
// data.status === "success"
```

If you call the client directly, the same two cases arrive as a throw and a
resolved error result:

```typescript
try {
  const result = toQueryResult(await connector.executeQuery({ query }));
  if (result.status === "error") { /* Power BI rejected the query */ }
} catch (err) {
  /* never reached Power BI */
}
```

### Result Handling

`toQueryResult` returns a discriminated union on `status`. On success the
`table` has:
- `columns`: `Array<{ name: string, dataType: string }>`
- `rows`: `unknown[][]`, row-major, values aligned with `columns` by index

```typescript
// result.table.columns = [{ name: "Product[Name]", dataType: "unknown" },
//                          { name: "[Sales]", dataType: "unknown" }]
// result.table.rows    = [["Widget", 42], ["Gadget", 17]]
```

**Do not branch on `dataType`.** It is `"unknown"` whenever the payload carries
no column metadata, which is the common in-app case: column names are then
inferred from the first row. Supply display types yourself through
`columnMetadata` and `toDataTable`.

Because names are inferred from the first row in that fallback, a query whose
first row omits a column (or returns no rows) yields no columns for it. Shape
the DAX so every column is present in the first row.

### Caching

There is none. The connectors client does not cache, and this template does not
add one — every call reaches Power BI.

If a screen re-queries more than you want, hold the result in state or memoize at
the call site. Don't introduce a shared, process-global store without a
per-principal key and a TTL: without the first it serves one user's rows to the
next after a sign-in change, and without the second it serves stale rows after a
model refresh.

### Error Categories

| Category | Meaning | Example |
|----------|---------|---------|
| `query` | Invalid DAX | `"Syntax error at position 18"` |
| `overflow` | Row or byte cap exceeded, data truncated | `"More than 1000000 rows in a query result"` |
| `api` | Auth or dataset-level failure — usually needs you to change something | 401 Unauthorized |
| `network` | The request never left the machine — worth retrying as-is | Connection reset |
| `unknown` | Could not categorize | Parse failure |

These are the categories the connector puts on a **returned** result
(`data.status === "error"`). A failure that never reached Power BI — a wiring
mistake, transport, or auth — is thrown instead and arrives on the hook's `error`,
with the original on `error.cause`.

`overflow` means the result is **truncated but present**. Treat it as a
failure rather than rendering partial data as if it were complete.

## Common Patterns

### Multiple models

```typescript
const sales = useSemanticModelQuery({ connection: "sales", query: salesDax });
const inventory = useSemanticModelQuery({ connection: "inventory", query: invDax });
```

### Re-running a query

```typescript
const { data, refetch } = useSemanticModelQuery({ connection: "sales", query });
await refetch();
```

## Anti-Patterns

- **Don't branch on `dataType`** — it is `"unknown"` whenever column metadata was absent and names had to be inferred from the first row.
- **Don't treat a resolved promise as success** — check `status`.
- **Don't send `workspaceId` or `itemId`** — they come from `rayfin.yml` server-side.
- **Don't read only one error channel** — a thrown failure leaves `data` undefined, so a component that checks only `data.status` renders nothing and looks broken.
- **Don't return unbounded results** — there is no default row cap. Bound the DAX with an aggregation or `TOPN(...)`.

## Type Reference

```typescript
import type {
  ExecuteQueryInput,
  FabricSemanticModelTabularResponse,
  SemanticModelQueryResult,
  QueryTable,
  QueryColumn,
  QueryError,
} from "@microsoft/rayfin-connector-fabric-semanticmodel";
```

For full type definitions, see `references/types.md` in this skill.
