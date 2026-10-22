import type { AnalysisRunRecord } from '@rayfin-app/shared';
import { useMemo } from 'react';

import { humanize } from '@/lib/format';
import { safeJsonArray, type SourceInfo } from '@/lib/analyzer-types';

import { Card, Pill } from './ui';

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <Pill tone={on ? 'good' : 'muted'}>{on ? label : `No ${label.toLowerCase()}`}</Pill>
  );
}

export function SourcesPanel({ run }: { run: AnalysisRunRecord }) {
  const sources = useMemo(
    () => safeJsonArray<SourceInfo>(run.sourcesJson),
    [run.sourcesJson]
  );

  return (
    <Card
      title="Connected sources"
      description="What this agent can answer from, and how well each source is set up."
    >
      {sources.length === 0 ? (
        <p className="text-300 text-muted-foreground">
          This export did not include a source inventory. Standalone
          semantic-model runs analyze one model and list no connected sources.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-300 leading-300">
            <thead>
              <tr className="border-b border-border text-200 uppercase leading-200 tracking-wider text-muted-foreground">
                <th scope="col" className="py-200 pr-300 font-semibold">
                  Source
                </th>
                <th scope="col" className="py-200 pr-300 font-semibold">
                  Type
                </th>
                <th scope="col" className="py-200 pr-300 text-right font-semibold">
                  Objects
                </th>
                <th scope="col" className="py-200 pr-300 text-right font-semibold">
                  Examples
                </th>
                <th scope="col" className="py-200 font-semibold">
                  Setup
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sources.map((s) => (
                <tr key={`${s.name}-${s.kind}`}>
                  <th scope="row" className="py-300 pr-300 font-medium">
                    {s.name}
                  </th>
                  <td className="py-300 pr-300 text-muted-foreground">
                    {humanize(s.kind)}
                  </td>
                  <td className="py-300 pr-300 text-right font-numeric tabular-nums">
                    {s.selectedCount}
                  </td>
                  <td className="py-300 pr-300 text-right font-numeric tabular-nums">
                    {s.exampleCount}
                  </td>
                  <td className="py-300">
                    <div className="flex flex-wrap gap-100">
                      <Flag on={s.hasInstructions} label="Instructions" />
                      {s.preview ? <Pill tone="warn">Preview</Pill> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
