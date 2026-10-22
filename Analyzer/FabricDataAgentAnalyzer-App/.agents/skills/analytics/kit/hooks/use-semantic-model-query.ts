//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import type {
  ExecuteQueryInput,
  FabricSemanticModelTabularResponse,
  SemanticModelQueryResult,
} from '@microsoft/rayfin-connector-fabric-semanticmodel';
import { toQueryResult } from '@microsoft/rayfin-connector-fabric-semanticmodel';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getRayfinClient } from '@/lib/rayfin-client';

/**
 * One entry of the typed `client.connectors` proxy, narrowed to the operation
 * this hook uses.
 *
 * The schema keys `client.connectors` by the exact connector names declared in
 * `rayfin/rayfin.yml`, so it cannot be indexed by a `string` variable. This is
 * the one place that widening happens, and the missing-connector branch below
 * is what makes it safe.
 */
type ExecuteQueryClient = {
  executeQuery(
    input: ExecuteQueryInput
  ): Promise<FabricSemanticModelTabularResponse>;
};

interface UseSemanticModelQueryOptions {
  /** Connector name from `rayfin/rayfin.yml` (e.g. `salesModel`). */
  connection: string;
  /** DAX query string. */
  query: string;
}

interface UseSemanticModelQueryResult {
  data: SemanticModelQueryResult | undefined;
  isLoading: boolean;
  error: Error | undefined;
  refetch: () => Promise<void>;
}

interface QueryState {
  connection: string;
  query: string;
  data: SemanticModelQueryResult | undefined;
  isLoading: boolean;
  error: Error | undefined;
}

/** Message for a connector this app has not registered. Names the fix, not the symptom. */
function notRegistered(connection: string): string {
  return (
    `No connector named "${connection}". Register it in connectorConfigs and ` +
    `connectorRuntimes (packages/frontend/src/lib/connectors.ts), and check the name matches ` +
    `rayfin/rayfin.yml.`
  );
}

/**
 * Runs one DAX query through the semantic model connector and normalizes the
 * response.
 *
 * Throws for wiring, transport and auth failures. A query that reached Power BI
 * and failed there comes back as a result whose `status` is `error` instead.
 */
async function executeSemanticModelQuery(
  connection: string,
  query: string
): Promise<SemanticModelQueryResult> {
  // Async in this template: it resolves the deployed `rayfin.config.json` first.
  const client = await getRayfinClient();
  const connectors = (client as { connectors?: unknown }).connectors;

  if (!connectors) {
    throw new Error(
      `This app's Rayfin client has no "connectors". ` +
        `packages/frontend/src/lib/rayfin-client.ts ` +
        `builds a plain RayfinClient; querying a semantic model needs ` +
        `ConnectorsRayfinClient constructed with connectorConfigs and ` +
        `connectorRuntimes from packages/frontend/src/lib/connectors.ts. ` +
        `See step 1 of the ` +
        `analytics skill.`
    );
  }

  let connector: ExecuteQueryClient | undefined;
  try {
    connector = (connectors as Record<string, ExecuteQueryClient | undefined>)[
      connection
    ];
  } catch (err) {
    // The connectors proxy throws `UNKNOWN_CONNECTOR` for an unconfigured name
    // rather than returning undefined, so the miss arrives here.
    throw new Error(notRegistered(connection), { cause: err });
  }

  // Also checked: test doubles and any future pass-through may return undefined.
  if (!connector) throw new Error(notRegistered(connection));

  // Idempotent, and needed on both paths: a registered runtime normalizes
  // already, but a connector missing from `connectorRuntimes` falls through to
  // JSON pass-through and arrives in the wire shape.
  return toQueryResult(await connector.executeQuery({ query }));
}

/**
 * React hook that executes a DAX query against a Power BI semantic model
 * through the `fabric-semanticmodel` connector.
 *
 * The connector name is declared in `rayfin/rayfin.yml` (managed by
 * `rayfin connector add`). Its workspace and item are resolved server-side, so
 * the app never sends them and they never reach the browser.
 *
 * @example
 * const { data, isLoading } = useSemanticModelQuery({
 *   connection: 'salesModel',
 *   query: 'EVALUATE SUMMARIZE(Sales, Products[Name], "Total", SUM(Sales[Amount]))',
 * });
 *
 * if (data?.status === 'success') {
 *   const table = data.table; // table.columns, table.rows
 * }
 *
 * @example
 * // Two disjoint error channels - check both, in either order.
 * // `error`: what the connector threw (wiring, transport, auth). `data` is cleared.
 * // `data.status === 'error'`: what Power BI returned, categorised by the
 * // connector as 'query' | 'overflow' | 'api' | 'network'. `error` stays undefined.
 * // A component that reads only one renders nothing for half its failures.
 * if (error) console.error(error.message);
 * else if (data?.status === 'error')
 *   console.error(data.error.category, data.error.message);
 *
 * @remarks
 * An empty `connection` or `query` puts the hook idle and clears any previous
 * result. So a `connection` wired to the wrong variable shows up as a component
 * that never loads rather than as an error - check that first when nothing
 * renders.
 */
export function useSemanticModelQuery(
  options: UseSemanticModelQueryOptions
): UseSemanticModelQueryResult {
  const { connection, query } = options;
  const canExecute = Boolean(connection && query);
  const [state, setState] = useState<QueryState>(() => ({
    connection,
    query,
    data: undefined,
    isLoading: canExecute,
    error: undefined,
  }));

  // Input changes reset request UI during render, not from the fetch effect.
  if (state.connection !== connection || state.query !== query) {
    setState({
      connection,
      query,
      data: canExecute ? state.data : undefined,
      isLoading: canExecute,
      error: undefined,
    });
  }

  // Monotonic request id: only the newest run may publish, so a slow first query
  // cannot land after a fast second one and overwrite fresher rows.
  const latestRequest = useRef(0);

  const execute = useCallback(async () => {
    const requestId = ++latestRequest.current;
    if (!canExecute) return;

    let result: SemanticModelQueryResult | undefined;
    let thrown: Error | undefined;
    try {
      result = await executeSemanticModelQuery(connection, query);
    } catch (err) {
      // As-is, not re-wrapped: a transport failure carries its status and
      // service code as own properties, and a fresh Error would drop them.
      thrown =
        err instanceof Error ? err : new Error(String(err), { cause: err });
    }

    // Superseded by a newer run.
    if (requestId !== latestRequest.current) return;

    setState((current) => {
      if (current.connection !== connection || current.query !== query) {
        return current;
      }
      return {
        connection,
        query,
        data: thrown ? undefined : (result ?? current.data),
        isLoading: false,
        error: thrown,
      };
    });
  }, [connection, query, canExecute]);

  const refetch = useCallback(async () => {
    setState((current) => ({
      ...current,
      data: canExecute ? current.data : undefined,
      isLoading: canExecute,
      error: undefined,
    }));
    await execute();
  }, [execute, canExecute]);

  useEffect(() => {
    void execute();
    return () => {
      // The connector has no AbortSignal; invalidate completions on cleanup.
      latestRequest.current += 1;
    };
  }, [execute]);

  return {
    data: state.data,
    isLoading: state.isLoading,
    error: state.error,
    refetch,
  };
}
