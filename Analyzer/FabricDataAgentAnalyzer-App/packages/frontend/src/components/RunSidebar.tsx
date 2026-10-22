import type { AnalysisRunRecord } from '@rayfin-app/shared';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ratingTone } from '@/lib/analyzer-types';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import { ConfirmDelete } from './states';
import { TONE_SOLID } from './tones';

export function RunSidebar({
  runs,
  selectedId,
  onSelect,
  onDelete,
  deleting,
}: {
  runs: readonly AnalysisRunRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  deleting: boolean;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <nav aria-label="Analysis history" className="space-y-200">
      <h2 className="px-200 text-200 font-semibold uppercase leading-200 tracking-wider text-muted-foreground">
        History · {runs.length}
      </h2>
      <ul className="space-y-100">
        {runs.map((run) => {
          const active = run.id === selectedId;
          const label = `${run.agentName}, ${formatDate(run.generatedAt)}`;
          return (
            <li key={run.id}>
              <div
                className={cn(
                  'group flex items-center gap-100 rounded-xl border pr-100 transition-colors',
                  active
                    ? 'border-border bg-card'
                    : 'border-transparent hover:bg-accent/60'
                )}
              >
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onSelect(run.id)}
                  className="flex min-w-0 flex-1 items-center gap-300 px-300 py-300 text-left"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-2 shrink-0 rounded-full',
                      TONE_SOLID[ratingTone(run.rating)]
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-300 font-medium leading-300">
                      {run.agentName}
                    </span>
                    <span className="block text-200 leading-200 text-muted-foreground">
                      {formatDate(run.generatedAt)}
                    </span>
                  </span>
                  <span className="font-numeric text-400 font-bold tabular-nums">
                    {run.readinessPct == null ? '–' : `${run.readinessPct}%`}
                  </span>
                </button>
                {active ? (
                  <button
                    type="button"
                    aria-label={`Delete ${label}`}
                    onClick={() => setConfirming(run.id)}
                    className="rounded-md p-200 text-muted-foreground hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 aria-hidden="true" className="icon-size-200" />
                  </button>
                ) : null}
              </div>
              {confirming === run.id ? (
                <div className="mt-100">
                  <ConfirmDelete
                    label={label}
                    pending={deleting}
                    onCancel={() => setConfirming(null)}
                    onConfirm={() => {
                      void onDelete(run.id).then(() => setConfirming(null));
                    }}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
