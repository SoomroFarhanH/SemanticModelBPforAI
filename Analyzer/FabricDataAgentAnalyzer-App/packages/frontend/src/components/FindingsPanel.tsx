import type { AnalysisRunRecord, FindingRecord } from '@rayfin-app/shared';
import {
  Check,
  ChevronDown,
  ClipboardCheck,
  ExternalLink,
  Search,
  Wrench,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  SEVERITY_META,
  SEVERITY_ORDER,
  STATUS_META,
} from '@/lib/analyzer-types';
import {
  countByView,
  matchesView,
  remediationMarkdown,
  sortBacklog,
  type FindingView,
} from '@/lib/remediation';
import { cn } from '@/lib/utils';

import { TONE_SOLID } from './tones';
import { Card, Pill } from './ui';
import { EmptyState, ErrorState, LoadingState } from './states';

const VIEWS: { id: FindingView; label: string }[] = [
  { id: 'open', label: 'Open issues' },
  { id: 'evidence', label: 'Needs evidence' },
  { id: 'passed', label: 'Passed' },
  { id: 'all', label: 'All checks' },
];

const PAGE = 60;

function FindingCard({ finding }: { finding: FindingRecord }) {
  const [open, setOpen] = useState(false);
  const severity = SEVERITY_META[finding.severity] ?? SEVERITY_META.INFO;
  const status = STATUS_META[finding.status] ?? STATUS_META.UNKNOWN;
  const where = [finding.sourceName, finding.objectPath]
    .filter(Boolean)
    .join(' › ');
  const hasDetail = Boolean(
    finding.evidence || finding.recommendation || finding.docsUrl
  );

  return (
    <li className="relative overflow-hidden rounded-xl border border-border bg-card">
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 w-1',
          TONE_SOLID[severity.tone]
        )}
      />
      <button
        type="button"
        aria-expanded={open}
        disabled={!hasDetail}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-300 py-300 pl-500 pr-400 text-left enabled:hover:bg-accent/60 disabled:cursor-default"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-200">
            <span className="font-monospace text-200 font-semibold leading-200 text-muted-foreground">
              {finding.ruleId}
            </span>
            <Pill tone={severity.tone}>{severity.label}</Pill>
            <Pill tone={status.tone}>{status.label}</Pill>
          </div>
          <p className="mt-100 text-300 font-medium leading-300">
            {finding.title}
          </p>
          {where ? (
            <p className="mt-100 truncate text-200 leading-200 text-muted-foreground">
              {where}
            </p>
          ) : null}
        </div>
        {hasDetail ? (
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'icon-size-300 mt-100 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
              open && 'rotate-180'
            )}
          />
        ) : null}
      </button>

      {open ? (
        <div className="space-y-300 border-t border-border bg-secondary/60 py-400 pl-500 pr-400 text-300 leading-300">
          {finding.recommendation ? (
            <div className="rounded-lg bg-accent px-300 py-300 text-accent-foreground">
              <p className="flex items-center gap-200 text-200 font-semibold uppercase leading-200 tracking-wider">
                <Wrench aria-hidden="true" className="icon-size-200" />
                How to fix
              </p>
              <p className="mt-100 whitespace-pre-line">
                {finding.recommendation}
              </p>
            </div>
          ) : null}
          {finding.evidence ? (
            <div>
              <p className="text-200 font-semibold uppercase leading-200 tracking-wider text-muted-foreground">
                What the analyzer saw
              </p>
              <p className="mt-100 whitespace-pre-line text-muted-foreground">
                {finding.evidence}
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-400 text-200 leading-200">
            {finding.automation ? (
              <span className="text-muted-foreground">
                Check type:{' '}
                <span className="font-medium text-foreground">
                  {finding.automation.charAt(0) +
                    finding.automation.slice(1).toLowerCase()}
                </span>
              </span>
            ) : null}
            {finding.docsUrl ? (
              <a
                href={finding.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-100 font-medium text-primary underline-offset-2 hover:underline"
              >
                Microsoft Learn
                <ExternalLink aria-hidden="true" className="icon-size-100" />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function FindingsPanel({
  run,
  findings,
  status,
  error,
  onRetry,
  view,
  onViewChange,
  severity,
  onSeverityChange,
}: {
  run: AnalysisRunRecord;
  findings: readonly FindingRecord[];
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  onRetry: () => void;
  view: FindingView;
  onViewChange: (view: FindingView) => void;
  severity: string | null;
  onSeverityChange: (severity: string | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [copied, setCopied] = useState(false);

  const counts = useMemo(() => countByView(findings), [findings]);
  const sources = useMemo(
    () =>
      [...new Set(findings.map((f) => f.sourceName).filter(Boolean))].sort() as string[],
    [findings]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = findings.filter((f) => {
      if (!matchesView(f, view)) return false;
      if (severity && f.severity !== severity) return false;
      if (source && f.sourceName !== source) return false;
      if (!needle) return true;
      return [f.ruleId, f.title, f.sourceName, f.objectPath, f.recommendation]
        .filter(Boolean)
        .some((text) => text!.toLowerCase().includes(needle));
    });
    return sortBacklog(filtered);
  }, [findings, view, severity, source, query]);

  const shown = visible.slice(0, limit);
  const groups = SEVERITY_ORDER.map((s) => ({
    severity: s,
    items: shown.filter((f) => f.severity === s),
  })).filter((g) => g.items.length > 0);

  async function copyPlan() {
    try {
      await navigator.clipboard.writeText(remediationMarkdown(run, visible));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card
      title="Findings"
      description="Start with blockers and critical items; each card explains how to fix it."
      action={
        <button
          type="button"
          onClick={() => void copyPlan()}
          disabled={visible.length === 0}
          className="inline-flex shrink-0 items-center gap-200 rounded-lg border border-input bg-card px-300 py-200 text-300 font-medium leading-300 hover:bg-accent disabled:opacity-50"
        >
          {copied ? (
            <Check aria-hidden="true" className="icon-size-200 text-success" />
          ) : (
            <ClipboardCheck aria-hidden="true" className="icon-size-200" />
          )}
          {copied ? 'Copied' : 'Copy as checklist'}
        </button>
      }
    >
      <div
        role="tablist"
        aria-label="Finding views"
        className="flex flex-wrap gap-200"
      >
        {VIEWS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={view === id}
            onClick={() => {
              onViewChange(id);
              setLimit(PAGE);
            }}
            className={cn(
              'rounded-full border px-300 py-100 text-300 font-medium leading-300',
              view === id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-card hover:bg-accent'
            )}
          >
            {label}{' '}
            <span className="font-numeric tabular-nums opacity-80">
              {counts[id]}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-300 flex flex-wrap items-center gap-300">
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Search findings</span>
          <Search
            aria-hidden="true"
            className="icon-size-200 absolute left-300 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Search rule, title, object…"
            className="w-full rounded-lg border border-input bg-card py-200 pl-800 pr-300 text-300 leading-300 placeholder:text-muted-foreground"
          />
        </label>
        <label>
          <span className="sr-only">Filter by severity</span>
          <select
            value={severity ?? ''}
            onChange={(e) => onSeverityChange(e.target.value || null)}
            className="rounded-lg border border-input bg-card px-300 py-200 text-300 leading-300"
          >
            <option value="">All severities</option>
            {SEVERITY_ORDER.map((s) => (
              <option key={s} value={s}>
                {SEVERITY_META[s].label}
              </option>
            ))}
          </select>
        </label>
        {sources.length > 1 ? (
          <label>
            <span className="sr-only">Filter by source</span>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="max-w-[220px] rounded-lg border border-input bg-card px-300 py-200 text-300 leading-300"
            >
              <option value="">All sources</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="mt-400">
        {status === 'loading' ? (
          <LoadingState rows={4} />
        ) : status === 'error' ? (
          <ErrorState
            message={error ?? 'Could not load findings.'}
            onRetry={onRetry}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            title={
              findings.length === 0
                ? 'No findings were saved for this run'
                : 'Nothing matches these filters'
            }
            hint={
              findings.length === 0
                ? 'The export contained no applicable checks.'
                : 'Try another view or clear the search and filters.'
            }
          />
        ) : (
          <div className="space-y-500">
            {groups.map((group) => (
              <section key={group.severity} aria-label={SEVERITY_META[group.severity].label}>
                <h3 className="mb-200 text-200 font-semibold uppercase leading-200 tracking-wider text-muted-foreground">
                  {SEVERITY_META[group.severity].label} · {group.items.length}
                </h3>
                <ul className="space-y-200">
                  {group.items.map((f) => (
                    <FindingCard key={f.id} finding={f} />
                  ))}
                </ul>
              </section>
            ))}
            {visible.length > shown.length ? (
              <button
                type="button"
                onClick={() => setLimit((n) => n + PAGE)}
                className="w-full rounded-lg border border-input bg-card py-200 text-300 font-medium hover:bg-accent"
              >
                Show {Math.min(PAGE, visible.length - shown.length)} more of{' '}
                {visible.length - shown.length} remaining
              </button>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
}
