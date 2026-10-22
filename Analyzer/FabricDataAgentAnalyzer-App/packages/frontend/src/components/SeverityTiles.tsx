import type { FindingRecord } from '@rayfin-app/shared';

import {
  SEVERITY_META,
  SEVERITY_ORDER,
  type Tone,
} from '@/lib/analyzer-types';
import { countBySeverity } from '@/lib/remediation';
import { cn } from '@/lib/utils';

import { TONE_SOLID, TONE_TEXT } from './tones';
import { Card } from './ui';

const SHOWN = SEVERITY_ORDER.filter((s) => s !== 'INFO');

/** Open (failed or warning) findings by severity; each tile opens that slice. */
export function SeverityTiles({
  findings,
  onSelect,
}: {
  findings: readonly FindingRecord[];
  onSelect: (severity: string) => void;
}) {
  const counts = countBySeverity(findings);
  const total = SHOWN.reduce((sum, s) => sum + (counts[s] ?? 0), 0);

  return (
    <Card
      title="Open work"
      description={
        total === 0
          ? 'No failed or warning checks. Nice.'
          : `${total} failed or warning ${total === 1 ? 'check' : 'checks'} to fix.`
      }
      className="h-full"
    >
      <div className="grid grid-cols-2 gap-300">
        {SHOWN.map((severity) => {
          const meta = SEVERITY_META[severity];
          const tone: Tone = counts[severity] ? meta.tone : 'muted';
          return (
            <button
              key={severity}
              type="button"
              onClick={() => onSelect(severity)}
              disabled={!counts[severity]}
              className={cn(
                'group relative overflow-hidden rounded-xl border border-border bg-secondary px-400 py-300 text-left transition-colors',
                'enabled:hover:border-ring enabled:hover:bg-accent disabled:cursor-default'
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'absolute inset-x-0 top-0 h-1',
                  TONE_SOLID[tone],
                  !counts[severity] && 'opacity-30'
                )}
              />
              <span
                className={cn(
                  'block font-numeric text-hero-800 font-bold leading-hero-800 tabular-nums',
                  TONE_TEXT[tone]
                )}
              >
                {counts[severity] ?? 0}
              </span>
              <span className="mt-100 block text-200 leading-200 text-muted-foreground">
                {meta.label}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
