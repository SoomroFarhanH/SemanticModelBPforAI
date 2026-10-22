import { Moon, Sun, Upload } from 'lucide-react';
import { useState } from 'react';

import type { RunsApi } from '@/hooks/use-runs';
import { useTheme } from '@/hooks/theme.context';
import { formatDateTime } from '@/lib/format';
import type { FindingView } from '@/lib/remediation';
import { cn } from '@/lib/utils';

import { EmptyDashboard } from './components/EmptyDashboard';
import { EvidencePanel, PriorityList } from './components/PriorityList';
import { FindingsPanel } from './components/FindingsPanel';
import { GatesPanel } from './components/GatesPanel';
import { ImportDialog } from './components/ImportDialog';
import { RunSidebar } from './components/RunSidebar';
import { ScopeChart } from './components/ScopeChart';
import { ScoreCard } from './components/ScoreCard';
import { SeverityTiles } from './components/SeverityTiles';
import { SourcesPanel } from './components/SourcesPanel';
import { ErrorState, LoadingState } from './components/states';
import { TrendChart } from './components/TrendChart';

type Tab = 'overview' | 'findings' | 'sources';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'findings', label: 'Findings' },
  { id: 'sources', label: 'Sources' },
];

function LogoMark() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="12" strokeWidth="4" className="stroke-muted" />
      <path
        d="M16 4a12 12 0 0 1 11.4 8.3"
        strokeWidth="4"
        strokeLinecap="round"
        className="stroke-primary"
      />
      <path
        d="M11.5 16.5l3.2 3.2 6-6.4"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary"
      />
    </svg>
  );
}

/** Presentational shell: everything it shows comes from the `api` it is given. */
export function AppView({ api }: { api: RunsApi }) {
  const { isDark, toggleTheme } = useTheme();
  const [importing, setImporting] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [view, setView] = useState<FindingView>('open');
  const [severity, setSeverity] = useState<string | null>(null);

  const run = api.selectedRun;

  function openFindings(nextView: FindingView, nextSeverity: string | null) {
    setView(nextView);
    setSeverity(nextSeverity);
    setTab('findings');
  }

  const sameAgentRuns = run
    ? api.runs.filter((r) => r.agentName === run.agentName)
    : [];

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center gap-400 px-500 py-300">
          <LogoMark />
          <div className="min-w-0">
            <h1 className="truncate text-500 font-bold leading-500">
              Data Agent Readiness
            </h1>
            <p className="hidden text-200 leading-200 text-muted-foreground sm:block">
              Score, release gates and what to fix next
            </p>
          </div>
          <div className="ml-auto flex items-center gap-200">
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="inline-flex shrink-0 items-center gap-200 whitespace-nowrap rounded-lg bg-primary px-400 py-200 text-300 font-medium leading-300 text-primary-foreground hover:opacity-90"
            >
              <Upload aria-hidden="true" className="icon-size-200" />
              <span>Import results</span>
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="rounded-lg border border-input p-200 hover:bg-accent"
            >
              {isDark ? (
                <Sun aria-hidden="true" className="icon-size-300" />
              ) : (
                <Moon aria-hidden="true" className="icon-size-300" />
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-500 py-500">
        {api.runsStatus === 'loading' && api.runs.length === 0 ? (
          <LoadingState rows={4} />
        ) : api.runsStatus === 'error' ? (
          <ErrorState
            message={api.runsError ?? 'Could not load your analysis history.'}
            onRetry={() => void api.reloadRuns()}
          />
        ) : api.runs.length === 0 || !run ? (
          <EmptyDashboard onImport={() => setImporting(true)} />
        ) : (
          <div className="grid grid-cols-1 gap-600 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="hidden lg:block">
              <div className="sticky top-[88px]">
                <RunSidebar
                  runs={api.runs}
                  selectedId={run.id}
                  onSelect={api.selectRun}
                  onDelete={api.removeRun}
                  deleting={api.deleting}
                />
              </div>
            </aside>

            <main className="min-w-0 space-y-500">
              {api.actionError ? (
                <ErrorState
                  message={api.actionError}
                  onRetry={api.clearActionError}
                />
              ) : null}

              <div className="lg:hidden">
                <label className="block text-200 leading-200 text-muted-foreground">
                  Analysis run
                  <select
                    value={run.id}
                    onChange={(e) => api.selectRun(e.target.value)}
                    className="mt-100 w-full rounded-lg border border-input bg-card px-300 py-200 text-300 text-foreground"
                  >
                    {api.runs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.agentName} · {formatDateTime(r.generatedAt)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div>
                <h2 className="text-hero-800 font-bold leading-hero-800">
                  {run.agentName}
                </h2>
                <p className="mt-100 text-300 leading-300 text-muted-foreground">
                  Analyzed {formatDateTime(run.generatedAt)}
                  {run.workspace ? ` · ${run.workspace}` : ''}
                </p>
              </div>

              <div
                role="tablist"
                aria-label="Report sections"
                className="flex gap-400 border-b border-border"
              >
                {TABS.map(({ id, label }) => (
                  <button
                    key={id}
                    role="tab"
                    type="button"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={cn(
                      '-mb-px border-b-2 px-100 pb-300 pt-100 text-300 font-medium leading-300 transition-colors',
                      tab === id
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'overview' ? (
                <div className="grid grid-cols-1 gap-500 lg:grid-cols-12">
                  <div className="flex flex-col gap-500 lg:col-span-5">
                    <ScoreCard run={run} />
                    <div className="flex-1">
                      <SeverityTiles
                        findings={api.findings}
                        onSelect={(s) => openFindings('open', s)}
                      />
                    </div>
                  </div>
                  <div className="lg:col-span-7">
                    <GatesPanel run={run} />
                  </div>
                  <div className="lg:col-span-7">
                    <ScopeChart run={run} />
                  </div>
                  <div className="lg:col-span-5">
                    <PriorityList
                      findings={api.findings}
                      onViewAll={() => openFindings('open', null)}
                    />
                  </div>
                  {sameAgentRuns.length > 1 ? (
                    <div className="lg:col-span-7">
                      <TrendChart runs={api.runs} current={run} />
                    </div>
                  ) : null}
                  <div
                    className={
                      sameAgentRuns.length > 1
                        ? 'lg:col-span-5'
                        : 'lg:col-span-12'
                    }
                  >
                    <EvidencePanel
                      findings={api.findings}
                      onViewAll={() => openFindings('evidence', null)}
                    />
                  </div>
                </div>
              ) : null}

              {tab === 'findings' ? (
                <FindingsPanel
                  run={run}
                  findings={api.findings}
                  status={api.findingsStatus}
                  error={api.findingsError}
                  onRetry={() => void api.reloadFindings()}
                  view={view}
                  onViewChange={setView}
                  severity={severity}
                  onSeverityChange={setSeverity}
                />
              ) : null}

              {tab === 'sources' ? <SourcesPanel run={run} /> : null}
            </main>
          </div>
        )}
      </div>

      {importing ? (
        <ImportDialog
          existingRuns={api.runs}
          state={api.importState}
          onImport={api.importParsed}
          onReset={api.resetImport}
          onClose={() => {
            api.resetImport();
            setImporting(false);
          }}
        />
      ) : null}
    </div>
  );
}
