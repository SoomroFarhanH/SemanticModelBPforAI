import type { AnalysisRunRecord, FindingRecord } from '@rayfin-app/shared';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseAnalyzerBundle } from '@/lib/analyzer-bundle';

const SAMPLE = resolve(
  import.meta.dirname,
  '../../../../samples/SAMPLE_analyzer_evidence.json'
);

export function sampleText(): string {
  return readFileSync(SAMPLE, 'utf-8');
}

export function sampleParsed() {
  return parseAnalyzerBundle(sampleText());
}

/** The sample export as the records the app reads back from storage. */
export function sampleRecords(id = 'run-1'): {
  run: AnalysisRunRecord;
  findings: FindingRecord[];
} {
  const { run, findings } = sampleParsed();
  return {
    run: { ...run, id, importedAt: new Date(), owner_id: 'user-1' },
    findings: findings.map((f, i) => ({
      ...f,
      id: `f-${i}`,
      run_id: id,
      owner_id: 'user-1',
    })),
  };
}
