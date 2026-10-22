import type { AnalysisRunRecord } from '@rayfin-app/shared';
import { VegaVisual, useCssTheme } from '@microsoft/fabric-visuals';
import type { VisualizationSpec } from '@microsoft/fabric-visuals';
import type { DataTable } from '@microsoft/fabric-visuals-core';
import { useMemo } from 'react';

import { timeValue } from '@/lib/format';

import { Card } from './ui';

const SPEC: VisualizationSpec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
  width: 'container',
  height: 'container',
  mark: { type: 'line' },
  encoding: {
    x: { field: 'date', type: 'temporal', axis: { title: null, tickCount: 5 } },
    y: {
      field: 'value',
      type: 'quantitative',
      scale: { domain: [0, 1] },
      axis: { title: null, tickCount: 5 },
    },
    color: {
      field: 'measure',
      type: 'nominal',
      scale: {
        domain: ['Readiness', 'Coverage'],
        range: ['#0e7c74', '#5b8def'],
      },
      legend: { title: null, orient: 'bottom' },
    },
    tooltip: [
      { field: 'date', type: 'temporal' },
      { field: 'measure', type: 'nominal' },
      { field: 'value', type: 'quantitative' },
    ],
  },
};

/** Readiness and coverage across imported runs of the same agent. */
export function TrendChart({
  runs,
  current,
}: {
  runs: readonly AnalysisRunRecord[];
  current: AnalysisRunRecord;
}) {
  const theme = useCssTheme();

  const data = useMemo<DataTable>(() => {
    const history = runs
      .filter((r) => r.agentName === current.agentName)
      .sort((a, b) => timeValue(a.generatedAt) - timeValue(b.generatedAt));
    const rows: unknown[][] = [];
    for (const run of history) {
      const date = new Date(run.generatedAt).toISOString();
      if (run.readinessPct != null) {
        rows.push([date, 'Readiness', run.readinessPct / 100]);
      }
      if (run.coveragePct != null) {
        rows.push([date, 'Coverage', run.coveragePct / 100]);
      }
    }
    return {
      columns: [
        { name: 'date', displayName: 'Run date' },
        { name: 'measure', displayName: 'Measure' },
        { name: 'value', displayName: 'Score', format: '0%' },
      ],
      rows,
    };
  }, [runs, current.agentName]);

  return (
    <Card
      title="Progress across runs"
      description={`Readiness and coverage for ${current.agentName}.`}
      className="h-full"
      bodyClassName="flex flex-col"
    >
      <div className="h-[260px] min-h-0 flex-1">
        <VegaVisual spec={SPEC} data={data} theme={theme} />
      </div>
    </Card>
  );
}
