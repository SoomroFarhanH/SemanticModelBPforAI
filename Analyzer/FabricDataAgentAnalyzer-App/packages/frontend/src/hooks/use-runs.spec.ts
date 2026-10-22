import type { AnalysisRunRecord, FindingRecord } from '@rayfin-app/shared';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRuns } from './use-runs';
import { sampleParsed } from '@/test/fixtures';

const api = vi.hoisted(() => ({
  listRuns: vi.fn(),
  listFindings: vi.fn(),
  importRun: vi.fn(),
  deleteRun: vi.fn(),
}));
vi.mock('@/lib/runs-api', () => api);

function run(id: string): AnalysisRunRecord {
  return { ...sampleParsed().run, id, importedAt: new Date(), owner_id: 'u' };
}

function finding(runId: string, ruleId: string): FindingRecord {
  return {
    id: `${runId}-${ruleId}`,
    run_id: runId,
    ruleId,
    status: 'FAIL',
    severity: 'CRITICAL',
    title: ruleId,
    owner_id: 'u',
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.listFindings.mockImplementation(async (id: string) => [
    finding(id, `RULE-${id}`),
  ]);
});

describe('useRuns', () => {
  it('loads history, selects the newest run and loads its findings', async () => {
    api.listRuns.mockResolvedValue([run('r2'), run('r1')]);
    const { result } = renderHook(() => useRuns());

    expect(result.current.runsStatus).toBe('loading');
    await waitFor(() =>
      expect(result.current.findings.map((f) => f.ruleId)).toEqual(['RULE-r2'])
    );

    expect(result.current.findingsStatus).toBe('ready');
    expect(result.current.selectedRun?.id).toBe('r2');
  });

  it('never shows the previous run’s findings while the next run loads', async () => {
    api.listRuns.mockResolvedValue([run('r2'), run('r1')]);
    const { result } = renderHook(() => useRuns());
    await waitFor(() =>
      expect(result.current.findings.map((f) => f.ruleId)).toEqual(['RULE-r2'])
    );

    let release: (rows: FindingRecord[]) => void = () => {};
    api.listFindings.mockReturnValueOnce(
      new Promise<FindingRecord[]>((resolve) => (release = resolve))
    );
    act(() => result.current.selectRun('r1'));

    expect(result.current.selectedRun?.id).toBe('r1');
    expect(result.current.findingsStatus).toBe('loading');
    expect(result.current.findings).toEqual([]);

    await act(async () => release([finding('r1', 'LATE')]));
    expect(result.current.findings.map((f) => f.ruleId)).toEqual(['LATE']);
  });

  it('ignores a slow reply for a run that is no longer selected', async () => {
    api.listRuns.mockResolvedValue([run('r2'), run('r1')]);
    const { result } = renderHook(() => useRuns());
    await waitFor(() =>
      expect(result.current.findings.map((f) => f.ruleId)).toEqual(['RULE-r2'])
    );

    let releaseSlow: (rows: FindingRecord[]) => void = () => {};
    api.listFindings
      .mockReturnValueOnce(
        new Promise<FindingRecord[]>((resolve) => (releaseSlow = resolve))
      )
      .mockResolvedValueOnce([finding('r2', 'FAST')]);

    act(() => result.current.selectRun('r1'));
    act(() => result.current.selectRun('r2'));
    await waitFor(() =>
      expect(result.current.findings.map((f) => f.ruleId)).toEqual(['FAST'])
    );
    await act(async () => releaseSlow([finding('r1', 'SLOW')]));

    expect(result.current.selectedRun?.id).toBe('r2');
    expect(result.current.findings.map((f) => f.ruleId)).toEqual(['FAST']);
  });

  it('reports a failed history load and recovers on retry', async () => {
    api.listRuns.mockRejectedValueOnce(new Error('Not signed in'));
    const { result } = renderHook(() => useRuns());
    await waitFor(() => expect(result.current.runsStatus).toBe('error'));
    expect(result.current.runsError).toBe('Not signed in');

    api.listRuns.mockResolvedValueOnce([run('r1')]);
    act(() => result.current.reloadRuns());
    await waitFor(() => expect(result.current.runsStatus).toBe('ready'));
    expect(result.current.selectedRun?.id).toBe('r1');
  });

  it('reports failed findings and retries just those', async () => {
    api.listRuns.mockResolvedValue([run('r1')]);
    api.listFindings.mockRejectedValueOnce(new Error('Timeout'));
    const { result } = renderHook(() => useRuns());
    await waitFor(() => expect(result.current.findingsStatus).toBe('error'));
    expect(result.current.findingsError).toBe('Timeout');

    act(() => result.current.reloadFindings());
    await waitFor(() => expect(result.current.findingsStatus).toBe('ready'));
    expect(api.listRuns).toHaveBeenCalledTimes(1);
  });

  it('imports a run, then selects it', async () => {
    api.listRuns.mockResolvedValueOnce([run('r1')]);
    const { result } = renderHook(() => useRuns());
    await waitFor(() => expect(result.current.selectedRun?.id).toBe('r1'));

    api.importRun.mockResolvedValue(run('r3'));
    api.listRuns.mockResolvedValue([run('r3'), run('r1')]);
    let ok = false;
    await act(async () => {
      ok = await result.current.importParsed(sampleParsed());
    });

    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.selectedRun?.id).toBe('r3'));
    expect(result.current.importState.status).toBe('idle');
  });

  it('keeps nothing and reports the error when an import fails', async () => {
    api.listRuns.mockResolvedValue([run('r1')]);
    const { result } = renderHook(() => useRuns());
    await waitFor(() => expect(result.current.selectedRun?.id).toBe('r1'));

    api.importRun.mockRejectedValue(new Error('Quota exceeded'));
    let ok = true;
    await act(async () => {
      ok = await result.current.importParsed(sampleParsed());
    });

    expect(ok).toBe(false);
    expect(result.current.importState).toEqual({
      status: 'error',
      error: 'Quota exceeded',
    });
    expect(api.listRuns).toHaveBeenCalledTimes(1);
  });

  it('removes a run and moves to the next one', async () => {
    api.listRuns.mockResolvedValueOnce([run('r2'), run('r1')]);
    const { result } = renderHook(() => useRuns());
    await waitFor(() => expect(result.current.selectedRun?.id).toBe('r2'));

    api.deleteRun.mockResolvedValue(undefined);
    api.listRuns.mockResolvedValue([run('r1')]);
    await act(async () => result.current.removeRun('r2'));

    expect(api.deleteRun).toHaveBeenCalledWith('r2');
    await waitFor(() => expect(result.current.selectedRun?.id).toBe('r1'));
  });

  it('shows no findings and a ready state when the last run is removed', async () => {
    api.listRuns.mockResolvedValueOnce([run('r1')]);
    const { result } = renderHook(() => useRuns());
    await waitFor(() => expect(result.current.selectedRun?.id).toBe('r1'));

    api.deleteRun.mockResolvedValue(undefined);
    api.listRuns.mockResolvedValue([]);
    await act(async () => result.current.removeRun('r1'));

    await waitFor(() => expect(result.current.runs).toEqual([]));
    expect(result.current.selectedRun).toBeNull();
    expect(result.current.findingsStatus).toBe('ready');
  });

  it('surfaces a failed delete without losing the run', async () => {
    api.listRuns.mockResolvedValue([run('r1')]);
    const { result } = renderHook(() => useRuns());
    await waitFor(() => expect(result.current.selectedRun?.id).toBe('r1'));

    api.deleteRun.mockRejectedValue(new Error('Forbidden'));
    await act(async () => result.current.removeRun('r1'));

    expect(result.current.actionError).toBe('Forbidden');
    expect(result.current.selectedRun?.id).toBe('r1');
    expect(result.current.deleting).toBe(false);
  });
});
