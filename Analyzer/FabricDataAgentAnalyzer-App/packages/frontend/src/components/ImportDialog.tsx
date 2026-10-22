import type { AnalysisRunRecord } from '@rayfin-app/shared';
import { FileJson, Upload, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import type { ImportState } from '@/hooks/use-runs';
import { BundleError, parseAnalyzerBundle } from '@/lib/analyzer-bundle';
import {
  cleanRating,
  ratingTone,
  type ParsedBundle,
} from '@/lib/analyzer-types';
import { formatDateTime, timeValue } from '@/lib/format';
import { cn } from '@/lib/utils';

import { Pill } from './ui';

export function ImportDialog({
  existingRuns,
  state,
  onImport,
  onClose,
  onReset,
}: {
  existingRuns: readonly AnalysisRunRecord[];
  state: ImportState;
  onImport: (parsed: ParsedBundle) => Promise<boolean>;
  onClose: () => void;
  onReset: () => void;
}) {
  const [parsed, setParsed] = useState<ParsedBundle | null>(null);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const busy = state.status === 'importing';

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  function load(text: string, name: string) {
    onReset();
    try {
      setParsed(parseAnalyzerBundle(text));
      setParseError(null);
      setFileName(name);
    } catch (error) {
      setParsed(null);
      setParseError(
        error instanceof BundleError
          ? error.message
          : 'That file could not be read.'
      );
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    load(await file.text(), file.name);
  }

  const duplicate =
    parsed !== null &&
    existingRuns.some(
      (r) =>
        r.agentName === parsed.run.agentName &&
        timeValue(r.generatedAt) === parsed.run.generatedAt.getTime()
    );

  async function submit() {
    if (!parsed) return;
    if (await onImport(parsed)) onClose();
  }

  const progress = state.progress;
  const pct =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-400 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-full w-full max-w-xl overflow-y-auto rounded-3xl border border-border bg-card p-600 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-400">
          <div>
            <h2 id={titleId} className="text-600 font-bold leading-600">
              Import analyzer results
            </h2>
            <p className="mt-100 text-300 leading-300 text-muted-foreground">
              Choose the <code className="font-monospace">*_evidence.json</code>{' '}
              file the Fabric Data Agent Analyzer notebook exported.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-200 hover:bg-accent disabled:opacity-50"
          >
            <X aria-hidden="true" className="icon-size-300" />
          </button>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          tabIndex={-1}
          aria-label="Analyzer evidence JSON file"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <button
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void onFile(e.dataTransfer.files[0]);
          }}
          className={cn(
            'mt-500 flex w-full flex-col items-center gap-200 rounded-2xl border-2 border-dashed px-500 py-700 text-center transition-colors',
            dragging
              ? 'border-primary bg-accent'
              : 'border-input hover:border-primary hover:bg-accent/50'
          )}
        >
          {fileName ? (
            <FileJson aria-hidden="true" className="icon-size-600 text-primary" />
          ) : (
            <Upload aria-hidden="true" className="icon-size-600 text-primary" />
          )}
          <span className="text-400 font-semibold leading-400">
            {fileName || 'Drop the JSON file here, or browse'}
          </span>
          <span className="text-200 leading-200 text-muted-foreground">
            {fileName
              ? 'Click to choose a different file'
              : 'Saved by the notebook to Files/DataAgentReadiness/<agent>/<timestamp>/'}
          </span>
        </button>

        <div className="mt-300">
          <button
            type="button"
            onClick={() => setPasting((v) => !v)}
            className="text-300 font-medium text-primary hover:underline"
          >
            {pasting ? 'Hide paste box' : 'Or paste the JSON instead'}
          </button>
          {pasting ? (
            <label className="mt-200 block">
              <span className="sr-only">Pasted evidence JSON</span>
              <textarea
                rows={5}
                spellCheck={false}
                placeholder='{ "analyzer_version": "3.0.0", "scorecard": { … }, "findings": [ … ] }'
                onBlur={(e) => {
                  const text = e.target.value.trim();
                  if (text) load(text, 'Pasted JSON');
                }}
                className="w-full rounded-lg border border-input bg-card p-300 font-monospace text-200 leading-200"
              />
            </label>
          ) : null}
        </div>

        {parseError ? (
          <p
            role="alert"
            className="mt-400 rounded-lg bg-danger-soft px-300 py-200 text-300 leading-300 text-danger"
          >
            {parseError}
          </p>
        ) : null}

        {parsed ? (
          <div className="mt-400 rounded-2xl border border-border bg-secondary p-400">
            <div className="flex flex-wrap items-center gap-200">
              <p className="text-400 font-semibold leading-400">
                {parsed.run.agentName}
              </p>
              <Pill tone={ratingTone(parsed.run.rating)}>
                {cleanRating(parsed.run.rating)}
              </Pill>
            </div>
            <p className="mt-100 text-300 leading-300 text-muted-foreground">
              Readiness{' '}
              <strong className="text-foreground">
                {parsed.run.readinessPct ?? 'N/A'}
                {parsed.run.readinessPct == null ? '' : '%'}
              </strong>{' '}
              · {parsed.findings.length} checks · generated{' '}
              {formatDateTime(parsed.run.generatedAt)}
            </p>
            {parsed.warnings.map((w) => (
              <p key={w} className="mt-200 text-200 leading-200 text-warning">
                {w}
              </p>
            ))}
            {duplicate ? (
              <p className="mt-200 text-200 leading-200 text-warning">
                This export was already imported. Importing again would create a
                duplicate run.
              </p>
            ) : null}
          </div>
        ) : null}

        {state.status === 'importing' ? (
          <div className="mt-400" role="status">
            <div className="flex justify-between text-200 leading-200 text-muted-foreground">
              <span>
                {progress?.phase === 'findings'
                  ? `Saving checks ${progress.done} of ${progress.total}`
                  : 'Creating run…'}
              </span>
              <span className="font-numeric tabular-nums">{pct}%</span>
            </div>
            <div
              role="progressbar"
              aria-label="Import progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="mt-100 h-2 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ) : null}

        {state.status === 'error' ? (
          <p
            role="alert"
            className="mt-400 rounded-lg bg-danger-soft px-300 py-200 text-300 leading-300 text-danger"
          >
            The import did not finish, and nothing was kept. {state.error}
          </p>
        ) : null}

        <div className="mt-600 flex justify-end gap-300">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-input px-400 py-200 text-300 font-medium hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!parsed || busy || duplicate}
            className="rounded-lg bg-primary px-400 py-200 text-300 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Importing…' : 'Import results'}
          </button>
        </div>
      </div>
    </div>
  );
}
