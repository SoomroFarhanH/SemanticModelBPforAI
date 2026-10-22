import type { AnalysisRunRecord, FindingRecord } from '@rayfin-app/shared';

import type { ParsedBundle } from './analyzer-types';
import { getRayfinClient } from './rayfin-client';

/** Concurrent writes per batch: fast enough for ~600 rows, gentle on the API. */
const WRITE_BATCH = 8;
const PAGE_SIZE = 100;

const RUN_FIELDS = [
  'id',
  'agentName',
  'workspace',
  'stage',
  'runtime',
  'collectionMode',
  'analyzerVersion',
  'generatedAt',
  'importedAt',
  'readinessPct',
  'coveragePct',
  'rating',
  'ratingComment',
  'passCount',
  'warnCount',
  'failCount',
  'manualCount',
  'unknownCount',
  'gatesJson',
  'scopesJson',
  'sourcesJson',
  'owner_id',
] as const;

const FINDING_FIELDS = [
  'id',
  'run_id',
  'ruleId',
  'sourceName',
  'objectPath',
  'status',
  'severity',
  'title',
  'evidence',
  'recommendation',
  'docsUrl',
  'automation',
  'owner_id',
] as const;

export interface ImportProgress {
  phase: 'run' | 'findings';
  done: number;
  total: number;
}

async function currentUserId(): Promise<string> {
  const client = await getRayfinClient();
  const session = client.auth.getSession();
  if (!session.isAuthenticated || !session.user) {
    throw new Error('You are signed out. Sign in again and retry.');
  }
  return session.user.id;
}

/** Newest first. Pages through everything so older runs never silently vanish. */
export async function listRuns(): Promise<AnalysisRunRecord[]> {
  const client = await getRayfinClient();
  const runs: AnalysisRunRecord[] = [];
  let cursor: string | undefined;
  for (;;) {
    let query = client.data.AnalysisRun.select([...RUN_FIELDS])
      .orderBy({ generatedAt: 'desc' })
      .first(PAGE_SIZE);
    if (cursor) query = query.after(cursor);
    const page = await query.executePaginated();
    runs.push(...page.items);
    if (!page.hasNextPage || !page.endCursor) return runs;
    cursor = page.endCursor;
  }
}

export async function listFindings(runId: string): Promise<FindingRecord[]> {
  const client = await getRayfinClient();
  const findings: FindingRecord[] = [];
  let cursor: string | undefined;
  for (;;) {
    let query = client.data.Finding.select([...FINDING_FIELDS])
      .where({ run_id: { eq: runId } })
      .orderBy({ ruleId: 'asc' })
      .first(PAGE_SIZE);
    if (cursor) query = query.after(cursor);
    const page = await query.executePaginated();
    findings.push(...page.items);
    if (!page.hasNextPage || !page.endCursor) return findings;
    cursor = page.endCursor;
  }
}

async function inBatches<T>(
  items: readonly T[],
  work: (item: T) => Promise<unknown>,
  onBatchDone?: (done: number) => void
) {
  for (let i = 0; i < items.length; i += WRITE_BATCH) {
    const batch = items.slice(i, i + WRITE_BATCH);
    await Promise.all(batch.map(work));
    onBatchDone?.(Math.min(i + WRITE_BATCH, items.length));
  }
}

export async function deleteRun(runId: string): Promise<void> {
  const client = await getRayfinClient();
  const findings = await listFindings(runId);
  await inBatches(findings, (f) => client.data.Finding.delete({ id: f.id }));
  await client.data.AnalysisRun.delete({ id: runId });
}

/**
 * Saves a parsed export as one run plus its findings. If any write fails the
 * partial run is removed so a retry never leaves half an import behind.
 */
export async function importRun(
  parsed: ParsedBundle,
  onProgress?: (progress: ImportProgress) => void
): Promise<AnalysisRunRecord> {
  const client = await getRayfinClient();
  const owner_id = await currentUserId();
  const total = parsed.findings.length;

  onProgress?.({ phase: 'run', done: 0, total });
  const run = await client.data.AnalysisRun.create({
    ...parsed.run,
    importedAt: new Date(),
    owner_id,
  });

  try {
    onProgress?.({ phase: 'findings', done: 0, total });
    await inBatches(
      parsed.findings,
      (f) =>
        client.data.Finding.create({
          ...f,
          run: { id: run.id },
          run_id: run.id,
          owner_id,
        }),
      (done) => onProgress?.({ phase: 'findings', done, total })
    );
  } catch (error) {
    await deleteRun(run.id).catch(() => undefined);
    throw error;
  }

  return run;
}
