import type { AnalysisRunRecord } from '@rayfin-app/shared';
import { VegaVisual, useCssTheme } from '@microsoft/fabric-visuals';
import type { VisualizationSpec } from '@microsoft/fabric-visuals';
import type { DataTable } from '@microsoft/fabric-visuals-core';
import { useMemo } from 'react';

import {
  STATUS_META,
  STATUS_ORDER,
  safeJsonArray,
  type ScopeScore,
} from '@/lib/analyzer-types';

import { Card } from './ui';

const STATUS_COLORS: Record<string, string> = {
  PASS: '#2f9e6b',
  WARN: '#d99a1e',
  FAIL: '#d9483f',
  MANUAL: '#5b8def',
  UNKNOWN: '#8a97a0',
  NOT_EVALUATED: '#b8c1c7',
};

function countFor(scope: ScopeScore, status: string): number {
  switch (status) {
    case 'PASS':
      return scope.pass;
    case 'WARN':
      return scope.warn;
    case 'FAIL':
      return scope.fail;
    case 'MANUAL':
      return scope.manual;
    case 'UNKNOWN':
      return scope.unknown;
    default:
      return scope.notEvaluated;
  }
}

/** Stacked bars of check outcomes for each source and the common agent checks. */
export function ScopeChart({ run }: { run: AnalysisRunRecord }) {
  const theme = useCssTheme();

  const model = useMemo(() => {
    const all = safeJsonArray<ScopeScore>(run.scopesJson);
    const scopes = all.filter((s) => s.scope.toUpperCase() !== 'OVERALL');
    const shown = scopes.length > 0 ? scopes : all;

    const rows: unknown[][] = [];
    for (const scope of shown) {
      STATUS_ORDER.forEach((status, order) => {
        const checks = countFor(scope, status);
        if (checks > 0) {
          rows.push([scope.scope, STATUS_META[status].label, checks, order]);
        }
      });
    }

    const data: DataTable = {
      columns: [
        { name: 'scope', displayName: 'Scope' },
        { name: 'status', displayName: 'Outcome' },
        { name: 'checks', displayName: 'Checks', format: '#,0' },
        { name: 'order' },
      ],
      rows,
    };

    const spec: VisualizationSpec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      width: 'container',
      height: 'container',
      mark: { type: 'bar' },
      encoding: {
        y: {
          field: 'scope',
          type: 'nominal',
          sort: shown.map((s) => s.scope),
          axis: { title: null, labelLimit: 240 },
        },
        x: {
          field: 'checks',
          type: 'quantitative',
          stack: 'zero',
          axis: { title: null, tickMinStep: 1 },
        },
        color: {
          field: 'status',
          type: 'nominal',
          scale: {
            domain: STATUS_ORDER.map((s) => STATUS_META[s].label),
            range: STATUS_ORDER.map((s) => STATUS_COLORS[s]),
          },
          legend: { title: null, orient: 'bottom', symbolLimit: 0 },
        },
        order: { field: 'order', type: 'quantitative' },
        tooltip: [
          { field: 'scope', type: 'nominal' },
          { field: 'status', type: 'nominal' },
          { field: 'checks', type: 'quantitative' },
        ],
      },
    };

    return { data, spec, count: shown.length, hasRows: rows.length > 0 };
  }, [run.scopesJson]);

  return (
    <Card
      title="Checks by scope"
      description="How each source and the agent-level checks scored."
      className="h-full"
      bodyClassName="flex flex-col"
    >
      {model.hasRows ? (
        <div
          className="flex-1"
          style={{ minHeight: Math.max(280, model.count * 56 + 130) }}
        >
          <VegaVisual spec={model.spec} data={model.data} theme={theme} />
        </div>
      ) : (
        <p className="text-300 text-muted-foreground">
          This export did not include per-scope scores.
        </p>
      )}
    </Card>
  );
}
