import type { AnalysisRunRecord } from '@rayfin-app/shared';
import { useMemo } from 'react';

import { safeJsonArray, type Gate, type Tone } from '@/lib/analyzer-types';
import { cn } from '@/lib/utils';

import { TONE_TEXT } from './tones';
import { Card, Pill, StatusIcon } from './ui';

const GATE_META: Record<string, { label: string; tone: Tone }> = {
  PASS: { label: 'Pass', tone: 'good' },
  FAIL: { label: 'Fail', tone: 'bad' },
  UNKNOWN: { label: 'No evidence', tone: 'warn' },
  NA: { label: 'N/A', tone: 'muted' },
};

const GATE_ORDER = ['FAIL', 'UNKNOWN', 'PASS', 'NA'];

export function GatesPanel({ run }: { run: AnalysisRunRecord }) {
  const gates = useMemo(() => {
    const parsed = safeJsonArray<Gate>(run.gatesJson);
    return [...parsed].sort(
      (a, b) => GATE_ORDER.indexOf(a.status) - GATE_ORDER.indexOf(b.status)
    );
  }, [run.gatesJson]);

  const applicable = gates.filter((g) => g.status !== 'NA');
  const passed = applicable.filter((g) => g.status === 'PASS').length;

  return (
    <Card
      title="Release gates"
      description="Every applicable gate must pass before release."
      action={
        applicable.length > 0 ? (
          <Pill tone={passed === applicable.length ? 'good' : 'bad'}>
            {passed} of {applicable.length} passed
          </Pill>
        ) : null
      }
      className="h-full"
    >
      {gates.length === 0 ? (
        <p className="text-300 text-muted-foreground">
          This export did not include release gates.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {gates.map((gate) => {
            const meta = GATE_META[gate.status] ?? GATE_META.UNKNOWN;
            return (
              <li key={gate.gate} className="flex items-start gap-300 py-300">
                <StatusIcon
                  status={gate.status}
                  className={cn('mt-100 shrink-0', TONE_TEXT[meta.tone])}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-300 font-medium leading-300">
                    {gate.gate}
                  </p>
                  {gate.evidence ? (
                    <p
                      className="mt-100 line-clamp-2 text-200 leading-200 text-muted-foreground"
                      title={gate.evidence}
                    >
                      {gate.evidence}
                    </p>
                  ) : null}
                </div>
                <Pill tone={meta.tone}>{meta.label}</Pill>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
