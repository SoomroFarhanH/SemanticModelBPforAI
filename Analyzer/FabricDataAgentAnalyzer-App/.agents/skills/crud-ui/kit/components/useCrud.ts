import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A list backed by Rayfin data, with optimistic create / update / delete.
 *
 * Why optimistic: a Fabric round-trip is slow enough that a naive implementation
 * feels broken — you click Add, nothing happens, then a row appears. This applies
 * the change locally first and rolls it back if the server disagrees, so the UI
 * tracks intent while staying honest about failure.
 *
 * This owns state only. Rendering is yours.
 */

export interface Identified {
  id: string;
}

export interface CrudApi<T extends Identified> {
  list(): Promise<T[]>;
  create(input: Omit<T, 'id'>): Promise<T>;
  update(id: string, patch: Partial<Omit<T, 'id'>>): Promise<T>;
  remove(id: string): Promise<void>;
}

export type CrudStatus = 'loading' | 'ready' | 'error';

export interface UseCrudResult<T extends Identified> {
  readonly items: readonly T[];
  readonly status: CrudStatus;
  /** Non-null when the last operation failed. Cleared by the next successful one. */
  readonly error: string | null;
  /** True while a mutation is in flight — use to disable submit buttons. */
  readonly pending: boolean;
  create(input: Omit<T, 'id'>): Promise<void>;
  update(id: string, patch: Partial<Omit<T, 'id'>>): Promise<void>;
  remove(id: string): Promise<void>;
  refresh(): Promise<void>;
  clearError(): void;
}

export function useCrud<T extends Identified>(
  api: CrudApi<T>
): UseCrudResult<T> {
  const [items, setItems] = useState<readonly T[]>([]);
  const [status, setStatus] = useState<CrudStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // A late response from an unmounted component is a React warning and a memory
  // leak; a late response after a newer refresh is stale data overwriting fresh.
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    []
  );

  // The api object is typically constructed inline by the caller, so depending on
  // it directly would refetch on every render. Assigned in an effect rather than
  // during render: a ref write during render is not a safe render output, and
  // React's lint rules reject it.
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  }, [api]);

  const refresh = useCallback(async () => {
    setStatus('loading');
    try {
      const next = await apiRef.current.list();
      if (!alive.current) return;
      setItems(next);
      setStatus('ready');
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      setStatus('error');
      setError(message(e));
    }
  }, []);

  useEffect(() => {
    // `refresh` sets loading state before awaiting, which is what
    // react-hooks/set-state-in-effect flags. That rule guards against render
    // loops; this is a fetch on mount keyed to a stable callback, so it runs
    // once rather than on every render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const create = useCallback(async (input: Omit<T, 'id'>) => {
    // A temporary id keeps React keys stable until the real row arrives.
    const optimistic = { ...input, id: `pending-${crypto.randomUUID()}` } as T;
    setItems((prev) => [optimistic, ...prev]);
    setPending(true);
    try {
      const saved = await apiRef.current.create(input);
      if (!alive.current) return;
      setItems((prev) => prev.map((i) => (i.id === optimistic.id ? saved : i)));
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      setItems((prev) => prev.filter((i) => i.id !== optimistic.id));
      setError(message(e));
    } finally {
      if (alive.current) setPending(false);
    }
  }, []);

  const update = useCallback(
    async (id: string, patch: Partial<Omit<T, 'id'>>) => {
      let previous: T | undefined;
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i;
          previous = i;
          return { ...i, ...patch };
        })
      );
      setPending(true);
      try {
        const saved = await apiRef.current.update(id, patch);
        if (!alive.current) return;
        setItems((prev) => prev.map((i) => (i.id === id ? saved : i)));
        setError(null);
      } catch (e) {
        if (!alive.current) return;
        if (previous)
          setItems((prev) => prev.map((i) => (i.id === id ? previous! : i)));
        setError(message(e));
      } finally {
        if (alive.current) setPending(false);
      }
    },
    []
  );

  const remove = useCallback(async (id: string) => {
    let previous: readonly T[] = [];
    setItems((prev) => {
      previous = prev;
      return prev.filter((i) => i.id !== id);
    });
    setPending(true);
    try {
      await apiRef.current.remove(id);
      if (alive.current) setError(null);
    } catch (e) {
      if (!alive.current) return;
      setItems(previous); // restore position, not just presence
      setError(message(e));
    } finally {
      if (alive.current) setPending(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    items,
    status,
    error,
    pending,
    create,
    update,
    remove,
    refresh,
    clearError,
  };
}

function message(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'Something went wrong. Please try again.';
}
