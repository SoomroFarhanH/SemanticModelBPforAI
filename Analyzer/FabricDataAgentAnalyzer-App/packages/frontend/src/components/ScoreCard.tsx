import type { AnalysisRunRecord } from '@rayfin-app/shared';
import { Info } from 'lucide-react';

import { cleanRating, ratingTone, type Tone } from '@/lib/analyzer-types';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

import { ScoreRing } from './ScoreRing';
import { TONE_TEXT } from './tones';
import { Card, Meter, Pill } from './ui';

function Outcome({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: Tone;
}) {
  return (
    <div className="rounded-xl bg-secondary px-300 py-300">
      <dd
        className={cn(
          'font-numeric text-600 font-bold leading-600 tabular-nums',
          value > 0 ? TONE_TEXT[tone] : 'text-muted-foreground'
        )}
      >
        {value}
      </dd>
      <dt className="mt-100 text-200 leading-200 text-muted-foreground">
        {label}
      </dt>
    </div>
  );
}

export function ScoreCard({ run }: { run: AnalysisRunRecord }) {
  const tone = ratingTone(run.rating);
  const comment = run.ratingComment ?? '';
  const explainOverride =
    (tone === 'bad' || tone === 'warn') && !/override/i.test(comment);
  const facts: [string, string | null | undefined][] = [
    ['Stage', run.stage],
    ['Runtime', run.runtime],
    ['Collection', run.collectionMode],
    ['Analyzer', `v${run.analyzerVersion}`],
    ['Workspace', run.workspace],
    ['Generated', formatDateTime(run.generatedAt)],
  ];

  return (
    <Card className="h-full" bodyClassName="flex flex-col">
      <div className="flex flex-col items-center gap-600 sm:flex-row">
        <ScoreRing value={run.readinessPct} tone={tone} />
        <div className="min-w-0 flex-1 space-y-400 self-stretch">
          <div>
            <Pill tone={tone} className="text-300 leading-300">
              {cleanRating(run.rating)}
            </Pill>
            {comment ? (
              <p className="mt-200 text-300 leading-300 text-muted-foreground">
                {comment}
              </p>
            ) : null}
          </div>
          <Meter
            label="Evaluation coverage"
            value={run.coveragePct}
            tone="info"
          />
        </div>
      </div>

      {explainOverride ? (
        <p className="mt-500 flex items-start gap-200 rounded-lg bg-muted px-300 py-200 text-200 leading-200 text-muted-foreground">
          <Info aria-hidden="true" className="icon-size-200 mt-100 shrink-0" />
          Release gates override the average. One open blocker or missing gate
          evidence keeps an agent from being ready, whatever the score.
        </p>
      ) : null}

      <dl
        aria-label="Check outcomes"
        className="mt-500 grid grid-cols-2 gap-200 sm:grid-cols-4"
      >
        <Outcome label="Passed" value={run.passCount} tone="good" />
        <Outcome label="Warnings" value={run.warnCount} tone="warn" />
        <Outcome label="Failed" value={run.failCount} tone="bad" />
        <Outcome
          label="Not verified"
          value={run.manualCount + run.unknownCount}
          tone="info"
        />
      </dl>

      <div className="mt-auto pt-500">
        <dl className="grid grid-cols-2 gap-x-400 gap-y-300 border-t border-border pt-400 text-200 leading-200">
          {facts
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="mt-100 truncate font-medium" title={value ?? ''}>
                  {value}
                </dd>
              </div>
            ))}
        </dl>
      </div>
    </Card>
  );
}
