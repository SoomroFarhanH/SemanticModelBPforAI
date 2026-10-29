//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { GovernanceDashboard } from './GovernanceDashboard';
import { useEffect, useRef, useState } from 'react';
import type { GovernanceSnapshot } from '@rayfin-app/shared';
import { MAX_SNAPSHOT_BYTES, parseSnapshot } from '@rayfin-app/shared/governance-snapshot';
import exportSchema from '@rayfin-app/shared/governance-review.schema.json';
import bundledSnapshot from './data/governance-snapshot.json';
import reviewPrompt from '../../../docs/health-review-prompt.txt?raw';
import { formatUtc, saveFile } from './lib/governance-snapshot';

function App() {
  const [bundled] = useState(() => parseSnapshot(JSON.stringify(bundledSnapshot)));
  const [sessionSnapshot, setSessionSnapshot] = useState<GovernanceSnapshot | null>(null);
  const [candidate, setCandidate] = useState<{ report: GovernanceSnapshot; filename: string } | null>(null);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [revision, setRevision] = useState(0);
  const reader = useRef<FileReader | null>(null);
  const control = 'inline-flex items-center gap-200 rounded-xl border border-border bg-card px-300 py-200 text-200 font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50';

  useEffect(() => () => {
    const pending = reader.current;
    reader.current = null;
    pending?.abort();
  }, []);

  function loadReview(file: File) {
    const previous = reader.current;
    reader.current = null;
    previous?.abort();
    setReading(false);
    setCandidate(null);
    setError('');
    if (file.size > MAX_SNAPSHOT_BYTES) {
      setError('Review JSON exceeds the 25 MB import limit. The current review is unchanged.');
      return;
    }
    const pending = new FileReader();
    reader.current = pending;
    setReading(true);
    pending.onload = () => {
      if (reader.current !== pending) return;
      try {
        if (typeof pending.result !== 'string') throw new Error('The review file could not be decoded as text.');
        setCandidate({ report: parseSnapshot(pending.result), filename: file.name });
      } catch (failure) {
        setError(`Import failed: ${failure instanceof Error ? failure.message : 'Unable to validate this review.'} The current review is unchanged.`);
      } finally {
        setReading(false);
        reader.current = null;
      }
    };
    pending.onerror = () => {
      if (reader.current !== pending) return;
      setError('Unable to read the selected file. Check file access and try again. The current review is unchanged.');
      setReading(false);
      reader.current = null;
    };
    pending.readAsText(file);
  }

  function restoreBundled() {
    const pending = reader.current;
    reader.current = null;
    pending?.abort();
    setReading(false);
    setCandidate(null);
    setSessionSnapshot(null);
    setFilename('');
    setError('');
    setRevision(value => value + 1);
  }

  const reviewTools = <section id="import" aria-label="Import governance review" className="scroll-mt-24 rounded-3xl border border-primary/30 bg-card p-500 sm:p-600">
    <p className="text-200 font-bold uppercase tracking-widest text-primary">Your tenant / your browser session</p>
    <h2 className="mt-100 text-600 font-semibold">Import review JSON</h2>
    <p className="mt-300 text-300 text-muted-foreground">Run the Fabric Skills review, save its version 1 JSON export, then select that file here. Validation and visualization happen in this tab; the app does not upload the JSON or save it to browser storage. Reloading restores the bundled snapshot.</p>
    <div className="mt-400 flex flex-wrap items-center gap-300">
      <label className="text-300 font-semibold">Select governance review JSON
        <input aria-label="Select governance review JSON" type="file" accept=".json,application/json" disabled={reading} className="mt-200 block max-w-full text-200" onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) loadReview(file);
        }} />
      </label>
      <button type="button" className={control} onClick={restoreBundled}>Restore bundled snapshot</button>
    </div>
    <p role="status" className="mt-300 text-200 text-muted-foreground">{reading ? 'Reading and validating review...' : sessionSnapshot ? `Loaded ${filename} in this tab only. Tenant: ${sessionSnapshot.tenantId}.` : `Showing the bundled ${bundled.dataClassification} snapshot. Maximum import size: 25 MB.`}</p>
    {error && <p role="alert" className="mt-300 rounded-xl border border-destructive/40 p-300 text-300 text-destructive">{error}</p>}
    {candidate && <div role="region" aria-label="Review import preview" className="mt-400 space-y-300 rounded-xl border border-border p-400">
      <h3 className="text-400 font-semibold">Validated file - confirm before switching</h3>
      <p className="break-all text-300">{candidate.filename} / {candidate.report.dataClassification} / Tenant: {candidate.report.tenantId}</p>
      <p className="text-300">Collected through {formatUtc(candidate.report.collectedTo)} / {candidate.report.scope.workspaces} workspaces / {candidate.report.scope.inventoryItems} items / {candidate.report.findings.length} findings.</p>
      <p className="text-200 text-muted-foreground">Validation checks format and count consistency, not truthfulness or compliance. Confirm this is the intended tenant and reviewed evidence. Do not import data you are not allowed to view or screen-share.</p>
      <button type="button" className={control} onClick={() => {
        setSessionSnapshot(candidate.report);
        setFilename(candidate.filename);
        setCandidate(null);
        setRevision(value => value + 1);
      }}>Show this review</button>
      <button type="button" className={`${control} ml-200`} onClick={() => setCandidate(null)}>Cancel import</button>
    </div>}
    <details className="mt-400 text-300">
      <summary className="cursor-pointer font-semibold">First time? Get the skills, prompt, and export contract</summary>
      <p className="mt-300 text-200 text-muted-foreground">Install/update the official Fabric Skills bundle first. The current governance skill is onelake-catalog-cli; onelake-catalog-govern-cli is its former name. Open this repository in Copilot so the prompt can read the local schema and validator.</p>
      <div className="mt-300 flex flex-wrap gap-300">
        <a className={control} href="https://github.com/SoomroFarhanH/SemanticModelBPforAI/blob/main/FabricGovernance/README.md" target="_blank" rel="noopener noreferrer">Client setup guide</a>
        <button type="button" className={control} onClick={() => saveFile('fabric-health-review-prompt.txt', reviewPrompt, 'text/plain;charset=utf-8')}>Download review prompt</button>
        <button type="button" className={control} onClick={() => saveFile('fabric-governance-review.v1.schema.json', JSON.stringify(exportSchema, null, 2), 'application/json')}>Download export schema</button>
      </div>
      <textarea aria-label="Health review prompt" readOnly value={reviewPrompt} rows={10} className="mt-300 w-full rounded-xl border border-border bg-background p-300 font-mono text-200" />
    </details>
  </section>;

  return <GovernanceDashboard key={revision} snapshot={sessionSnapshot ?? bundled} reviewTools={reviewTools} />;
}

export default App;
