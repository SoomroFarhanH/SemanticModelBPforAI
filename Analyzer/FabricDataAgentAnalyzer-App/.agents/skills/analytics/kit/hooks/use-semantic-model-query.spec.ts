//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

// Runs once the pack has copied this kit into an app: the template's vitest
// `include` is `src/**/*.spec.ts`, and these imports resolve against the copied
// locations rather than the kit.
//
// Only the Rayfin client is mocked, so the connector's own `toQueryResult` runs
// for real against wire-shaped responses.

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useSemanticModelQuery } from '@/hooks/use-semantic-model-query';

const executeQuery = vi.fn();
const connectors: Record<string, unknown> = {};

/**
 * Stands in for the SDK's connectors proxy, which **throws**
 * `ConnectorsError('UNKNOWN_CONNECTOR')` for an unconfigured name rather than
 * returning `undefined`.
 */
const connectorsProxy = new Proxy(connectors, {
  get(target, key: string) {
    if (!(key in target)) {
      throw Object.assign(
        new Error(`Connector "${key}" was accessed but has no configuration.`),
        { code: 'UNKNOWN_CONNECTOR' }
      );
    }
    return target[key];
  },
});

let clientHasConnectors = true;

vi.mock('@/lib/rayfin-client', () => ({
  // Async, matching this template's client: the hook has to await it rather
  // than index a synchronous singleton.
  getRayfinClient: () =>
    Promise.resolve(clientHasConnectors ? { connectors: connectorsProxy } : {}),
}));

/** A wire-shaped success, as the FuncSet adapter returns it. */
const wireSuccess = (total: number) => ({
  status: 'Succeeded',
  output: {
    tables: [{ rows: [{ 'Sales[Total]': total }] }],
    requestId: 'r1',
  },
  errors: [],
});

describe('useSemanticModelQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(connectors)) delete connectors[key];
    connectors.model = { executeQuery };
    clientHasConnectors = true;
  });

  const render = (connection = 'model', query = 'EVALUATE ROW()') =>
    renderHook(() => useSemanticModelQuery({ connection, query }));

  it('starts in the loading state', () => {
    executeQuery.mockReturnValue(new Promise(() => {}));

    const { result } = render();

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeUndefined();
  });

  it('normalises a successful response into column-aligned rows', async () => {
    executeQuery.mockResolvedValue(wireSuccess(42));

    const { result } = render();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual({
      status: 'success',
      table: {
        columns: [{ name: 'Sales[Total]', dataType: 'unknown' }],
        rows: [[42]],
      },
      requestId: 'r1',
    });
    expect(result.current.error).toBeUndefined();
  });

  it('publishes an already-normalised result unchanged', async () => {
    // A registered runtime normalises internally, so this arrives as the union
    // rather than the wire shape. A connector missing from `connectorRuntimes`
    // falls through to raw JSON and does arrive in the wire shape, so this
    // pins that both paths agree.
    executeQuery.mockResolvedValue({
      status: 'success',
      table: {
        columns: [{ name: 'Sales[Total]', dataType: 'unknown' }],
        rows: [[7]],
      },
      requestId: 'r9',
    });

    const { result } = render();

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({
      status: 'success',
      table: {
        columns: [{ name: 'Sales[Total]', dataType: 'unknown' }],
        rows: [[7]],
      },
      requestId: 'r9',
    });
    expect(result.current.error).toBeUndefined();
  });

  it('reports a failure Power BI returned on the data channel only', async () => {
    executeQuery.mockResolvedValue({
      status: 'Succeeded',
      output: { tables: [], queryError: { message: 'bad DAX' } },
      errors: [],
    });

    const { result } = render();

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.status).toBe('error');
    // Categorised by the connector, not invented here.
    expect(
      result.current.data?.status === 'error' && result.current.data.error
    ).toMatchObject({ category: 'query', message: 'bad DAX' });
    // `error` must stay clear, or a caller checking it first never reaches the
    // structured branch and the category is unreachable.
    expect(result.current.error).toBeUndefined();
  });

  it('surfaces the thrown error itself, not a copy of its message', async () => {
    // Re-wrapping into a fresh Error keeps only the message and drops the
    // status and service code — exactly what separates an auth failure from a
    // malformed query.
    const thrown = Object.assign(new Error('401 Unauthorized'), {
      status: 401,
    });
    executeQuery.mockRejectedValue(thrown);

    const { result } = render();

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error).toBe(thrown);
    expect((result.current.error as { status?: number }).status).toBe(401);
  });

  it('clears a stale result when a later query throws', async () => {
    // Prevents rows staying on screen under an error banner. Asserting this on
    // the first query would pass either way - there has to be a result to lose.
    executeQuery.mockResolvedValueOnce(wireSuccess(42));
    const { result, rerender } = renderHook(
      ({ query }) => useSemanticModelQuery({ connection: 'model', query }),
      { initialProps: { query: 'EVALUATE ROW()' } }
    );
    await waitFor(() => expect(result.current.data).toBeDefined());

    executeQuery.mockRejectedValueOnce(new Error('401 Unauthorized'));
    rerender({ query: 'EVALUATE ROW(2)' });

    await waitFor(() => expect(result.current.error).toBeDefined());
    // A throw is not something Power BI returned, so it must not be dressed up
    // as a result either.
    expect(result.current.data).toBeUndefined();
  });

  it('names an unregistered connector as a wiring mistake', async () => {
    // The proxy throws for a name with no config. Left untranslated that
    // surfaces as a generic transport failure, sending the builder to look at
    // Fabric instead of at their own registration.
    delete connectors.model;

    const { result } = render();

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error?.message).toContain('connectorRuntimes');
    // The original is kept so the SDK's own code is still recoverable.
    expect((result.current.error?.cause as { code?: string })?.code).toBe(
      'UNKNOWN_CONNECTOR'
    );
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('says so when the app never wired ConnectorsRayfinClient', async () => {
    // The base template builds a plain RayfinClient with no `connectors`, and no
    // pack rewrites that file. Without this the first symptom is an unrelated
    // TypeError deep in the hook.
    clientHasConnectors = false;

    const { result } = render();

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error?.message).toContain('ConnectorsRayfinClient');
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it('does not let a slow earlier query overwrite a newer result', async () => {
    let resolveSlow: (value: unknown) => void = () => {};
    executeQuery.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSlow = resolve;
      })
    );

    const { result, rerender } = renderHook(
      ({ query }) => useSemanticModelQuery({ connection: 'model', query }),
      { initialProps: { query: 'EVALUATE ROW()' } }
    );

    executeQuery.mockResolvedValueOnce(wireSuccess(2));
    rerender({ query: 'EVALUATE ROW(2)' });
    await waitFor(() =>
      expect(result.current.data?.status === 'success').toBe(true)
    );

    // The first query lands last and must not publish. A microtask is not
    // enough to prove that: a stale publish needs several turns plus a React
    // flush to become visible, so asserting too early passes either way.
    await act(async () => {
      resolveSlow(wireSuccess(999));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(
      result.current.data?.status === 'success' &&
        result.current.data.table.rows
    ).toEqual([[2]]);
  });

  it('clears a previous result when it goes idle', async () => {
    executeQuery.mockResolvedValue(wireSuccess(1));

    const { result, rerender } = renderHook(
      ({ query }) => useSemanticModelQuery({ connection: 'model', query }),
      { initialProps: { query: 'EVALUATE ROW()' } }
    );
    await waitFor(() => expect(result.current.data).toBeDefined());

    // Leaving the rows in place renders data for a query that no longer
    // applies.
    rerender({ query: '' });

    await waitFor(() => expect(result.current.data).toBeUndefined());
    expect(result.current.isLoading).toBe(false);
  });

  it('keeps the previous result while an explicit refetch is loading', async () => {
    executeQuery.mockResolvedValueOnce(wireSuccess(1));
    const { result } = render();
    await waitFor(() => expect(result.current.data).toBeDefined());

    let resolveNext!: (value: unknown) => void;
    executeQuery.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveNext = resolve;
      })
    );
    let pending: Promise<void>;
    act(() => {
      pending = result.current.refetch();
    });
    expect(result.current.isLoading).toBe(true);
    expect(
      result.current.data?.status === 'success' &&
        result.current.data.table.rows
    ).toEqual([[1]]);

    await act(async () => {
      resolveNext(wireSuccess(2));
      await pending;
    });
    expect(result.current.isLoading).toBe(false);
    expect(
      result.current.data?.status === 'success' &&
        result.current.data.table.rows
    ).toEqual([[2]]);
  });

  it('does not publish an in-flight result after the query goes idle', async () => {
    let resolveQuery!: (value: unknown) => void;
    executeQuery.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveQuery = resolve;
      })
    );
    const { result, rerender } = renderHook(
      ({ query }) => useSemanticModelQuery({ connection: 'model', query }),
      { initialProps: { query: 'EVALUATE ROW()' } }
    );
    rerender({ query: '' });
    await act(async () => {
      resolveQuery(wireSuccess(9));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('starts loading again when revisiting a previously completed query', async () => {
    executeQuery.mockResolvedValueOnce(wireSuccess(1));
    const { result, rerender } = renderHook(
      ({ query }) => useSemanticModelQuery({ connection: 'model', query }),
      { initialProps: { query: 'EVALUATE ROW(1)' } }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    executeQuery.mockReturnValueOnce(new Promise(() => {}));
    rerender({ query: 'EVALUATE ROW(2)' });
    expect(result.current.isLoading).toBe(true);

    let resolveRevisited!: (value: unknown) => void;
    executeQuery.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRevisited = resolve;
      })
    );
    rerender({ query: 'EVALUATE ROW(1)' });
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      resolveRevisited(wireSuccess(3));
    });
    expect(result.current.isLoading).toBe(false);
    expect(
      result.current.data?.status === 'success' &&
        result.current.data.table.rows
    ).toEqual([[3]]);
  });
});
