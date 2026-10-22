import type { FindingRecord } from '@rayfin-app/shared';
import { ArrowRight } from 'lucide-react';

import { SEVERITY_META } from '@/lib/analyzer-types';
import { isOpen, needsEvidence, sortBacklog } from '@/lib/remediation';
import { cn } from '@/lib/utils';

import { TONE_SOLID } from './tones';
import { Card, Pill } from './ui';

/** The handful of items to fix first, with a path to the full list. */
export function PriorityList({
  findings,
  onViewAll,
}: {
  findings: readonly FindingRecord[];
  onViewAll: () => void;
}) {
  const open = sortBacklog(findings.filter(isOpen));
  const top = open.slice(0, 5);

  return (
    <Card
      title="Fix these first"
      description="Highest severity first, failures before warnings."
      className="h-full"
      action={
        open.length > 0 ? (
          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex shrink-0 items-center gap-100 text-300 font-medium leading-300 text-primary hover:underline"
          >
            All {open.length}
            <ArrowRight aria-hidden="true" className="icon-size-200" />
          </button>
        ) : null
      }
    >
      {top.length === 0 ? (
        <p className="text-300 leading-300 text-muted-foreground">
          Nothing to fix: every evaluated check passed.
        </p>
      ) : (
        <ol className="space-y-200">
          {top.map((f, index) => {
            const severity = SEVERITY_META[f.severity] ?? SEVERITY_META.INFO;
            return (
              <li
                key={f.id}
                className="relative flex gap-300 overflow-hidden rounded-xl border border-border bg-secondary py-300 pl-500 pr-400"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-y-0 left-0 w-1',
                    TONE_SOLID[severity.tone]
                  )}
                />
                <span className="font-numeric text-500 font-bold leading-500 text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-300 font-medium leading-300">{f.title}</p>
                  <p className="mt-100 line-clamp-2 text-200 leading-200 text-muted-foreground">
                    {f.recommendation ?? f.evidence ?? f.ruleId}
                  </p>
                </div>
                <Pill tone={severity.tone} className="self-start">
                  {severity.label}
                </Pill>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

/** Checks the analyzer could not evaluate; completing them raises coverage. */
export function EvidencePanel({
  findings,
  onViewAll,
}: {
  findings: readonly FindingRecord[];
  onViewAll: () => void;
}) {
  const missing = findings.filter(needsEvidence);
  const byStatus = (status: string) =>
    missing.filter((f) => f.status === status).length;

  return (
    <Card
      title="Evidence still needed"
      description="Manual or not-evaluated checks lower coverage, not readiness."
      className="h-full"
      action={
        missing.length > 0 ? (
          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex shrink-0 items-center gap-100 text-300 font-medium leading-300 text-primary hover:underline"
          >
            View
            <ArrowRight aria-hidden="true" className="icon-size-200" />
          </button>
        ) : null
      }
    >
      <p className="font-numeric text-hero-800 font-bold leading-hero-800 tabular-nums">
        {missing.length}
      </p>
      <p className="mt-100 text-300 leading-300 text-muted-foreground">
        {missing.length === 0
          ? 'Every applicable check has evidence.'
          : `${byStatus('MANUAL')} manual · ${byStatus('NOT_EVALUATED')} not evaluated · ${byStatus('UNKNOWN')} unknown`}
      </p>
      {missing.length > 0 ? (
        <p className="mt-300 text-200 leading-200 text-muted-foreground">
          Attest manual checks in the notebook, or enable live query tests and
          evaluation, then re-run and import the new export.
        </p>
      ) : null}
    </Card>
  );
}
