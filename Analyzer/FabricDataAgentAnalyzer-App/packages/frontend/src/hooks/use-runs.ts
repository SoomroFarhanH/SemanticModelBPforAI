import type { AnalysisRunRecord, FindingRecord } from '@rayfin-app/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ParsedBundle } from '@/lib/analyzer-types';
import {
  deleteRun,
  importRun,
  listFindings,
  listRuns,
  type ImportProgress,
} from '@/lib/runs-api';

type Load = 'loading' | 'ready' | 'error';

export interface ImportState {
  status: 'idle' | 'importing' | 'error';
  progress?: ImportProgress;
  error?: string;
}

interface RunsState {
  status: Load;
  runs: AnalysisRunRecord[];
  error: string | null;
}

/** Findings are tagged with the run they belong to, so a stale reply is never shown. */
interface FindingsState {
  runId: string | null;
  items: FindingRecord[];
  error: string | null;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Owns the run history, the selected run's findings, and import/delete. */
export function useRuns() {
  const [runsState, setRunsState] = useState<RunsState>({
    status: 'loading',
    runs: [],
    error: null,
  });
  const [runsToken, setRunsToken] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const preferredId = useRef<string | null>(null);

  const [findingsState, setFindingsState] = useState<FindingsState>({
    runId: null,
    items: [],
    error: null,
  });
  const [findingsToken, setFindingsToken] = useState(0);

  const [importState, setImportState] = useState<ImportState>({
    status: 'idle',
  });
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listRuns().then(
      (runs) => {
        if (cancelled) return;
        setRunsState({ status: 'ready', runs, error: null });
        setSelectedId((current) => {
          const preferred = preferredId.current;
          preferredId.current = null;
          if (preferred && runs.some((r) => r.id === preferred)) {
            return preferred;
          }
          if (current && runs.some((r) => r.id === current)) return current;
          return runs[0]?.id ?? null;
        });
      },
      (error: unknown) => {
        if (cancelled) return;
        setRunsState((s) => ({ ...s, status: 'error', error: message(error) }));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [runsToken]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    listFindings(selectedId).then(
      (items) => {
        if (!cancelled) setFindingsState({ runId: selectedId, items, error: null });
      },
      (error: unknown) => {
        if (!cancelled) {
          setFindingsState({
            runId: selectedId,
            items: [],
            error: message(error),
          });
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [selectedId, findingsToken]);

  const reloadRuns = useCallback((selectId?: string) => {
    preferredId.current = selectId ?? null;
    setRunsState((s) => ({ ...s, status: 'loading', error: null }));
    setRunsToken((t) => t + 1);
  }, []);

  const reloadFindings = useCallback(() => {
    setFindingsState({ runId: null, items: [], error: null });
    setFindingsToken((t) => t + 1);
  }, []);

  const importParsed = useCallback(
    async (parsed: ParsedBundle): Promise<boolean> => {
      setImportState({ status: 'importing' });
      try {
        const run = await importRun(parsed, (progress) =>
          setImportState({ status: 'importing', progress })
        );
        setImportState({ status: 'idle' });
        reloadRuns(run.id);
        return true;
      } catch (error) {
        setImportState({ status: 'error', error: message(error) });
        return false;
      }
    },
    [reloadRuns]
  );

  const resetImport = useCallback(() => setImportState({ status: 'idle' }), []);

  const removeRun = useCallback(
    async (runId: string) => {
      setDeleting(true);
      setActionError(null);
      try {
        await deleteRun(runId);
        reloadRuns();
      } catch (error) {
        setActionError(message(error));
      } finally {
        setDeleting(false);
      }
    },
    [reloadRuns]
  );

  const selectedRun =
    runsState.runs.find((r) => r.id === selectedId) ?? null;
  const findingsCurrent = findingsState.runId === selectedId;
  const findingsStatus: Load = !selectedId
    ? 'ready'
    : !findingsCurrent
      ? 'loading'
      : findingsState.error
        ? 'error'
        : 'ready';

  return {
    runs: runsState.runs,
    runsStatus: runsState.status,
    runsError: runsState.error,
    selectedRun,
    selectRun: setSelectedId,
    findings: selectedId && findingsCurrent ? findingsState.items : [],
    findingsStatus,
    findingsError: findingsCurrent ? findingsState.error : null,
    reloadFindings: reloadFindings,
    reloadRuns: () => reloadRuns(),
    importState,
    importParsed,
    resetImport,
    removeRun,
    deleting,
    actionError,
    clearActionError: () => setActionError(null),
  };
}

export type RunsApi = ReturnType<typeof useRuns>;
