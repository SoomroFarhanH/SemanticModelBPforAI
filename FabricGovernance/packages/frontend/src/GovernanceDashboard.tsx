import { DataGrid, type GridColumnDef, type Row } from '@microsoft/fabric-datagrid';
import { VegaVisual, useCssTheme, type VisualizationSpec } from '@microsoft/fabric-visuals';
import type { DataTable, InteractionEvent } from '@microsoft/fabric-visuals-core';
import { Activity, AlertTriangle, BookOpen, Boxes, Check, Database, Download, Moon, Search, Shield, Sun, Users } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type { GovernanceMetric, GovernanceSnapshot } from '@rayfin-app/shared';

import { useTheme } from '@/hooks/theme.context';
import { csvCell, formatUtc, saveFile, workspaceMatches, type WorkspaceFilter } from '@/lib/governance-snapshot';

type Metric = GovernanceMetric;
const workspaceFilters: readonly WorkspaceFilter[] = ['all', 'suspended', 'single-admin', 'empty', 'unresolved', 'unassigned'];
const priorities = ['Critical', 'High', 'Medium', 'Low'] as const;
const navigation = [
  ['Import review', 'import'], ['Overview', 'overview'], ['Health', 'health'], ['Protect & trust', 'coverage'],
  ['Findings', 'findings'], ['Workspaces', 'workspaces'], ['Refresh', 'refresh'], ['Scope & evidence', 'scope'],
] as const;
const labelChartSpec: VisualizationSpec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
  description: 'Unlabeled Power BI artifacts, by scanner-supported type',
  width: 'container',
  height: 'container',
  encoding: {
    x: { field: 'unlabeled', type: 'quantitative', axis: { title: 'Unlabeled artifacts', tickMinStep: 1 } },
    y: { field: 'artifactType', type: 'nominal', sort: '-x', axis: { title: null } },
  },
  layer: [
    { mark: { type: 'bar', cornerRadiusEnd: 4 } },
    { mark: { type: 'text', style: 'labelHorizontal', align: 'left', dx: 8 }, encoding: { text: { field: 'unlabeled', type: 'quantitative' } } },
  ],
};
const workspaceColumns: GridColumnDef[] = [
  { id: 'name', header: 'Workspace', width: 220, minWidth: 140 },
  { id: 'domain', header: 'Domain', width: 120 },
  { id: 'capacity', header: 'Capacity', width: 160 },
  { id: 'capacityState', header: 'Recorded state', width: 130 },
  { id: 'adminCount', header: 'Admins', width: 80, numericStyling: true },
  { id: 'items', header: 'Items', width: 80, numericStyling: true },
  { id: 'described', header: 'Described', width: 100, numericStyling: true },
  { id: 'tagged', header: 'Tagged', width: 90, numericStyling: true },
];
const panel = 'rounded-3xl border border-border bg-card p-500 sm:p-600';
const button = 'inline-flex items-center gap-200 rounded-xl border border-border bg-card px-300 py-200 text-200 font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const input = 'rounded-xl border border-border bg-card px-300 py-200 text-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function isWorkspaceFilter(value: string): value is WorkspaceFilter {
  return workspaceFilters.some(filter => filter === value);
}
function Badge({ children, critical = false }: { children: ReactNode; critical?: boolean }) {
  return <span className={`inline-flex rounded-lg border px-200 py-100 text-200 font-semibold ${critical ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-primary/30 bg-primary/10 text-primary'}`}>{children}</span>;
}
function SectionTitle({ title, eyebrow }: { title: string; eyebrow: string }) {
  return <div className="mb-500"><p className="text-200 font-bold uppercase tracking-widest text-primary">{eyebrow}</p><h2 className="mt-100 text-600 leading-600 font-semibold">{title}</h2></div>;
}
function MetricCard({ label, metric, icon: Icon, detail }: { label: string; metric: Metric; icon: typeof Boxes; detail: string }) {
  return <article className={panel} aria-label={label}>
    <div className="flex items-start justify-between gap-300"><p className="text-200 font-semibold text-muted-foreground">{label}</p><Icon aria-hidden="true" className="icon-size-300 text-primary" /></div>
    <p className="mt-400 font-numeric text-hero-900 leading-hero-900 font-bold tabular-nums">{metric.numerator}<span className="ml-100 text-400 font-medium text-muted-foreground">/ {metric.denominator}</span></p>
    <div role="img" aria-label={`${metric.percent}% of ${metric.denominator}`} className="mt-300 h-100 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${metric.percent}%` }} /></div>
    <p className="mt-200 text-200 text-muted-foreground">{metric.percent}% &middot; {detail}</p>
  </article>;
}
function Coverage({ label, metric }: { label: string; metric: Metric }) {
  return <div className="mt-400">
    <div className="flex justify-between gap-300 text-300"><span>{label}</span><strong>{metric.numerator}/{metric.denominator} ({metric.percent}%)</strong></div>
    <div role="img" aria-label={`${label}: ${metric.numerator} of ${metric.denominator}`} className="mt-200 h-200 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${metric.percent}%` }} /></div>
    <p className="mt-100 text-200 text-muted-foreground">{metric.scope}</p>
  </div>;
}

export function GovernanceDashboard({ snapshot, reviewTools }: { snapshot: GovernanceSnapshot; reviewTools: ReactNode }) {
  const { isDark, toggleTheme } = useTheme();
  const theme = useCssTheme();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<WorkspaceFilter>('all');
  const [findingQuery, setFindingQuery] = useState('');
  const [pillar, setPillar] = useState('');
  const [priority, setPriority] = useState('');
  const [selectedArtifactType, setSelectedArtifactType] = useState<string>();
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const metrics = snapshot.metrics;
  const isSynthetic = snapshot.dataClassification === 'synthetic';
  const overviewTitle = metrics.suspended.numerator > 0 ? 'Restore availability first.' : 'Review governance priorities.';
  const unresolvedCapacities = snapshot.workspaces.filter(w => w.capacity === 'Not resolvable').length;
  const semanticModels = snapshot.itemTypes.find(t => t.type === 'SemanticModel')?.total ?? 0;
  const endorsedFailures = snapshot.refreshFailures.filter(r => r.endorsed);
  const labelChartData: DataTable = useMemo(() => ({
    columns: [
      { name: 'artifactType', displayName: 'Scanned artifact type' },
      { name: 'unlabeled', displayName: 'Unlabeled artifacts', format: '#,0' },
    ],
    rows: snapshot.labelTypes.map(t => [t.type, t.total - t.labeled]),
  }), [snapshot]);
  const filteredWorkspaces = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return snapshot.workspaces.filter(w => workspaceMatches(w, filter) &&
      `${w.name} ${w.domain} ${w.capacity} ${w.admins.map(a => `${a.name} ${a.contact}`).join(' ')}`.toLocaleLowerCase().includes(needle));
  }, [filter, query, snapshot]);
  const workspaceRows: Row[] = useMemo(() => filteredWorkspaces.map(w => ({
    _id: w.id, name: w.name, domain: w.domain, capacity: w.capacity, capacityState: w.capacityState,
    adminCount: w.adminCount, items: w.items, described: w.described, tagged: w.tagged,
  })), [filteredWorkspaces]);
  const findings = snapshot.findings.filter(f => (!pillar || f.pillar === pillar) && (!priority || f.priority === priority) &&
    `${f.title} ${f.action} ${f.owner} ${f.examples.join(' ')}`.toLocaleLowerCase().includes(findingQuery.trim().toLocaleLowerCase()));
  const focused = snapshot.workspaces.find(w => w.id === selectedWorkspace);
  const exportWorkspaces = () => {
    const headers = ['Workspace', 'Domain', 'Capacity', 'Recorded capacity state', 'Admin principals', 'Items', 'Described', 'Tagged', 'Collected UTC'];
    const rows = filteredWorkspaces.map(w => [w.name, w.domain, w.capacity, w.capacityState, w.adminCount, w.items, w.described, w.tagged, snapshot.collectedTo]);
    saveFile('fabric-governance-workspaces.csv', [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  };
  const handleLabelInteraction = (events: InteractionEvent[]) => {
    const selected = events.find(e => e.action === 'select');
    const predicate = selected?.action === 'select' ? selected.selections.flatMap(s => s.predicates).find(p => p.type === 'set' && p.name === 'artifactType') : undefined;
    const value = predicate?.type === 'set' ? predicate.values[0] : undefined;
    setSelectedArtifactType(typeof value === 'string' ? value : undefined);
  };
  return (
    <div className="min-h-full bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-border bg-card px-400 py-500 lg:flex">
        <a href="#overview" className="mb-700 flex items-center gap-300 rounded-lg px-200 py-300 text-foreground no-underline focus-visible:outline-2 focus-visible:outline-ring">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><Shield aria-hidden="true" className="icon-size-300" /></span>
          <span><span className="block text-300 font-bold">Fabric Govern</span><span className="text-200 text-muted-foreground">{isSynthetic ? 'Synthetic demo' : 'Tenant review snapshot'}</span></span>
        </a>
        <nav aria-label="Report navigation" className="grid gap-100">{navigation.map(([label, target]) =>
          <a key={target} href={`#${target}`} className="rounded-xl px-300 py-200 text-300 text-foreground no-underline hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">{label}</a>)}</nav>
        <div className="mt-auto rounded-xl border border-border p-300"><p className="flex items-center gap-200 text-200 font-semibold"><Activity aria-hidden="true" className="icon-size-200" />{isSynthetic ? 'Synthetic snapshot' : 'Audit snapshot'}</p><p className="mt-200 text-200 text-muted-foreground">{isSynthetic ? 'Illustrative data only. No tenant was scanned to create this demo.' : 'No live refresh is configured. Recorded findings may differ from the current tenant.'}</p></div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-border bg-background">
          <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-300 px-400 py-300 sm:px-600">
            <div><p className="text-300 font-semibold">Fabric governance health{isSynthetic && ' / SYNTHETIC DEMO'}</p><p className="text-200 text-muted-foreground">Snapshot &middot; {formatUtc(snapshot.collectedTo)}</p></div>
            <div className="flex gap-200">
              <button type="button" className={button} onClick={() => saveFile('fabric-health-results.json', JSON.stringify(snapshot, null, 2), 'application/json')}><Download aria-hidden="true" className="icon-size-200" />Report JSON</button>
              <button type="button" className={button} aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme}>{isDark ? <Sun className="icon-size-200" aria-hidden="true" /> : <Moon className="icon-size-200" aria-hidden="true" />}<span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'} mode</span></button>
            </div>
          </div>
          <nav aria-label="Mobile report navigation" className="flex gap-200 overflow-x-auto px-400 pb-300 lg:hidden">{navigation.map(([label, target]) => <a key={target} href={`#${target}`} className="shrink-0 rounded-lg px-200 py-100 text-200 text-foreground no-underline hover:bg-muted">{label}</a>)}</nav>
        </header>
        <main className="mx-auto max-w-screen-2xl space-y-800 px-400 py-600 sm:px-600 lg:px-800">
          {reviewTools}
          <section id="overview" className="scroll-mt-24 space-y-500">
            <div className="flex flex-wrap items-end justify-between gap-400"><div>
              <p className="text-200 font-bold uppercase tracking-widest text-primary">Tenant governance &middot; {snapshot.collectedTo.slice(0, 10)}</p>
              <h1 className="mt-200 text-hero-900 leading-hero-900 font-bold tracking-tight">{overviewTitle}</h1>
              <p className="mt-200 max-w-3xl text-300 leading-300 text-muted-foreground">{snapshot.interpretation}</p>
            </div><Badge critical>{snapshot.status}</Badge></div>
            <div className="flex items-start gap-300 rounded-3xl border border-border border-l-4 border-l-destructive bg-card p-500">
              <AlertTriangle className="icon-size-300 shrink-0 text-destructive" aria-hidden="true" /><div>
                <p className="text-300 font-semibold">{isSynthetic ? 'Synthetic demo data, not a real tenant audit.' : 'Historical snapshot, not live tenant status.'}</p>
                <p className="mt-100 text-300 text-muted-foreground">{isSynthetic ? 'All names, contacts, IDs, counts, dates and findings are fictional. No governance API requests were made to create this sample.' : `Collected ${formatUtc(snapshot.collectedFrom)} through ${formatUtc(snapshot.collectedTo)}. Capacity states and refresh attempts are recorded evidence, not current workload probes. No tenant configuration was changed by this app.`}</p>
                <p className="mt-200 text-200 text-muted-foreground">{isSynthetic ? 'Safe for sample walkthroughs. Protected Microsoft sign-in is still required.' : 'This imported tenant snapshot can contain confidential names and owner contacts. Share only with approved viewers; protected Microsoft sign-in is required.'}</p>
              </div>
            </div>
            <div className="grid gap-400 sm:grid-cols-2 2xl:grid-cols-4">
              <MetricCard label="Workspaces on suspended capacity" metric={metrics.suspended} detail="active standard workspaces" icon={Database} />
              <MetricCard label="Workspaces with a single human admin" metric={metrics.singleAdmin} detail="one directly assigned User admin" icon={Users} />
              <MetricCard label="Unlabeled Power BI artifacts" metric={metrics.unlabeled} detail="scanner-supported artifacts only" icon={Shield} />
              <MetricCard label="Failed last-recorded refreshes" metric={metrics.failedRefresh} detail="returned in-scope refreshables" icon={Activity} />
            </div>
            <p className="text-200 text-muted-foreground">{snapshot.scope.workspaces} active standard workspaces &middot; {snapshot.scope.inventoryItems} Fabric inventory items &middot; {snapshot.scope.domains} domains &middot; {isSynthetic ? 'simulated inventory coverage' : 'all inventory pages complete'}. No aggregate health score is inferred from partial coverage.</p>
          </section>
          <section id="health" className="scroll-mt-24">
            <SectionTitle eyebrow="01 / Health" title="Availability and accountable ownership" />
            <div className="grid gap-400 xl:grid-cols-2">
              <article className={panel}><h3 className="text-400 font-semibold">Capacity placement</h3><p className="mt-100 text-200 text-muted-foreground">Recorded capacity state &middot; workspace counts, not utilization</p>
                {snapshot.capacities.map(c => <div key={c.id} className="mt-400 border-t border-border pt-300">
                  <div className="flex flex-wrap items-center justify-between gap-200"><p className="break-all text-300 font-semibold">{c.name} <span className="text-200 text-muted-foreground">{c.sku}</span></p><Badge critical={c.state === 'Suspended'}>{c.state}</Badge></div>
                  <div className="mt-200 h-100 overflow-hidden rounded-full bg-muted"><div className={`h-full ${c.state === 'Suspended' ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${snapshot.scope.workspaces ? c.workspaceCount / snapshot.scope.workspaces * 100 : 0}%` }} /></div>
                  <p className="mt-200 text-200 text-muted-foreground">{c.workspaceCount}/{snapshot.scope.workspaces} workspaces &middot; {c.itemCount} items &middot; {c.admins.length} explicit admins</p>
                  {c.serviceManagedReserved && <p className="text-200 text-muted-foreground">Service-managed reserved capacity; not flagged as ownerless or idle.</p>}
                </div>)}
                <p className="mt-400 text-200 text-muted-foreground">{unresolvedCapacities} workspace capacity references do not resolve; their state is unknown. CU, overload and throttling require the Capacity Metrics app.</p>
              </article>
              <article className={panel}><h3 className="text-400 font-semibold">Domain accountability</h3>
                {snapshot.domains.map(d => <div key={d.id} className="mt-400 space-y-300 rounded-xl border border-border p-400">
                  <div className="flex flex-wrap justify-between gap-200"><h4 className="text-500 font-semibold">{d.displayName}</h4><Badge critical={d.adminCount === 0}>Explicit admins: {d.adminCount}</Badge></div>
                  <p>{d.workspaceCount} workspaces: {d.workspaceNames.join(', ')}</p>
                  <dl className="grid grid-cols-2 gap-300 text-300"><div><dt className="text-muted-foreground">Contributor scope</dt><dd className="font-semibold">{d.entireTenantContributor ? 'Entire tenant' : 'Restricted'}</dd></div><div><dt className="text-muted-foreground">Description</dt><dd className="font-semibold">{d.description.trim() ? 'Present' : 'Missing'}</dd></div></dl>
                  <p className="text-200 text-muted-foreground">Review accountable admins, contributor scope and default sensitivity labels before expanding membership. Domain membership is not an item access boundary.</p>
                </div>)}
                <h3 className="mt-500 text-400 font-semibold">Act in dependency order</h3>
                <ol className="mt-300 space-y-400">{snapshot.remediation.map(s => <li key={s.step} className="flex gap-300"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 font-semibold text-primary">{s.step}</span><div><p className="text-300 font-semibold">{s.title}</p><p className="mt-100 text-200 text-muted-foreground">{s.action}</p><p className="mt-100 text-200 font-semibold">{s.owner}</p></div></li>)}</ol>
              </article>
            </div>
          </section>
          <section id="coverage" className="scroll-mt-24">
            <SectionTitle eyebrow="02 / Protect & 03 / Trust" title="Classification, discovery, and reuse" />
            <div className="grid gap-400 xl:grid-cols-2">
              <article className={panel}><h3 className="text-400 font-semibold">Unlabeled Power BI artifacts by type</h3><p className="mt-100 text-200 text-muted-foreground">{metrics.unlabeled.denominator} scanner-supported artifacts. Native Fabric metadata is not inferred.</p>
                <div className="mt-300 h-72 min-h-0" aria-label="Label coverage chart"><VegaVisual data={labelChartData} spec={labelChartSpec} theme={theme} onInteraction={handleLabelInteraction} style={{ height: '100%', width: '100%' }} /></div>
                <p aria-live="polite" className="min-h-6 text-200 text-muted-foreground">{selectedArtifactType ? `Selected: ${selectedArtifactType}` : 'Select a bar to inspect its artifact type.'}</p>
              </article>
              <article className={panel}><h3 className="text-400 font-semibold">Presence, not quality</h3>
                <Coverage label="Domain assignment" metric={metrics.domainAssigned} /><Coverage label="Sensitivity label present" metric={metrics.labeled} />
                <Coverage label="Description present" metric={metrics.described} /><Coverage label="At least one tag" metric={metrics.tagged} /><Coverage label="Endorsement present" metric={metrics.endorsed} />
                {endorsedFailures.length > 0 && <p className="mt-400 rounded-xl border border-primary/30 bg-primary/5 p-300 text-300"><strong>Health × Trust:</strong> Endorsed assets have failed last-recorded refreshes: {endorsedFailures.map(r => r.name).join(', ')}. Verify with their configured owners before relying on freshness.</p>}
              </article>
            </div>
          </section>
          <section id="findings" className="scroll-mt-24">
            <SectionTitle eyebrow="Evidence to action" title="Prioritized findings" />
            <div className="mb-400 flex flex-wrap gap-300">
              <input aria-label="Search findings" type="search" className={`${input} min-w-0 flex-1`} placeholder="Search finding, action, or owner" value={findingQuery} onChange={e => setFindingQuery(e.target.value)} />
              <select aria-label="Filter pillar" className={input} value={pillar} onChange={e => setPillar(e.target.value)}><option value="">All pillars</option>{['Health', 'Protect', 'Trust'].map(p => <option key={p}>{p}</option>)}</select>
              <select aria-label="Filter priority" className={input} value={priority} onChange={e => setPriority(e.target.value)}><option value="">All priorities</option>{priorities.map(p => <option key={p}>{p}</option>)}</select>
            </div><p aria-live="polite" className="mb-300 text-200 text-muted-foreground">{findings.length} of {snapshot.findings.length} findings shown</p>
            <div className="space-y-300">{findings.map(f => <details key={f.key} className="rounded-3xl border border-border bg-card" open={f.priority === 'Critical' || undefined}>
              <summary className="cursor-pointer rounded-3xl p-400 text-300 focus-visible:outline-2 focus-visible:outline-ring"><Badge critical={f.priority === 'Critical' || f.priority === 'High'}>{f.priority}</Badge> <strong className="ml-200">{f.title}</strong><span className="ml-300 text-200 text-muted-foreground">{f.pillar} &middot; {f.evidence.numerator}/{f.evidence.denominator} ({f.evidence.percent}%)</span></summary>
              <div className="space-y-400 border-t border-border p-500"><dl className="grid gap-400 text-300 md:grid-cols-2">
                <div><dt className="font-semibold text-primary">Evidence and scope</dt><dd className="mt-100">{f.evidence.numerator}/{f.evidence.denominator} ({f.evidence.percent}%) — {f.evidence.scope}<p className="mt-100 text-200 text-muted-foreground">{f.evidence.source}</p></dd></div>
                <div><dt className="font-semibold text-primary">Why it matters</dt><dd className="mt-100">{f.why}</dd></div>
                <div><dt className="font-semibold text-primary">Recommended action</dt><dd className="mt-100">{f.action}</dd></div>
                <div><dt className="font-semibold text-primary">Who can act / effort</dt><dd className="mt-100">{f.owner}<p className="mt-100 text-200 text-muted-foreground">{f.effort}</p></dd></div>
              </dl>{f.detail && <p className="rounded-xl bg-muted p-300 text-200">{f.detail}</p>}<h4 className="font-semibold">Named examples</h4><ul className="list-inside list-disc space-y-100 text-200 text-muted-foreground">{f.examples.map(example => <li key={example}>{example}</li>)}</ul><p className="text-200 text-muted-foreground">Snapshot collected {formatUtc(snapshot.collectedTo)}. All inventory pages complete. Active standard workspace scope unless stated otherwise; admin insights may lag up to 24 hours.</p></div>
            </details>)}{findings.length === 0 && <p className={panel}>No findings match these filters.</p>}</div>
          </section>
          <section id="workspaces" className="scroll-mt-24">
            <SectionTitle eyebrow="Object evidence" title="Workspace drill-down" />
            <div className="mb-400 flex flex-wrap items-center gap-300"><label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 icon-size-200 text-muted-foreground" aria-hidden="true" /><input className={`${input} w-full pl-10`} aria-label="Search workspace, capacity, or admin" type="search" placeholder="Search workspace, capacity, or admin" value={query} onChange={e => setQuery(e.target.value)} /></label>
              <select aria-label="Filter workspace findings" className={input} value={filter} onChange={e => { if (isWorkspaceFilter(e.target.value)) setFilter(e.target.value); }}><option value="all">All workspaces</option><option value="suspended">On suspended capacity</option><option value="single-admin">Single human admin</option><option value="empty">Zero inventory items</option><option value="unresolved">Unresolvable capacity</option><option value="unassigned">No domain</option></select>
              <button type="button" className={button} onClick={exportWorkspaces}><Download className="icon-size-200" aria-hidden="true" />Export filtered CSV</button>
            </div><p aria-live="polite" className="mb-300 text-200 text-muted-foreground">Showing {filteredWorkspaces.length} of {snapshot.scope.workspaces} workspaces</p>
            <div role="region" aria-label="Workspace evidence grid" className="h-96 min-h-0 overflow-hidden rounded-3xl border border-border bg-card">
              <DataGrid data={workspaceRows} columns={workspaceColumns} theme={theme} />
            </div>
            <article className={`${panel} mt-400`}><label className="block text-300 font-semibold" htmlFor="workspace-detail">Workspace owner contacts and portal link</label><select id="workspace-detail" className={`${input} mt-300 w-full`} value={selectedWorkspace} onChange={e => setSelectedWorkspace(e.target.value)}><option value="">Select a workspace</option>{filteredWorkspaces.map(w => <option value={w.id} key={w.id}>{w.name}</option>)}</select>
              {focused && <div className="mt-400 space-y-300">{!isSynthetic && focused.url ? <a href={focused.url} target="_blank" rel="noopener noreferrer" className="text-300 font-semibold text-primary underline">Open {focused.name} in Fabric</a> : <p className="text-300 font-semibold">{isSynthetic ? 'Synthetic workspace - no real Fabric portal link.' : 'No verified Fabric portal link supplied.'}</p>}<ul className="space-y-200 text-300">{focused.admins.map(a => <li key={a.contact}><strong>{a.name}</strong> ({a.type}) — <span className="break-all">{a.contact}</span></li>)}</ul></div>}
              <p className="mt-300 text-200 text-muted-foreground">Zero inventory items does not mean unused. Contacts and capacity state are snapshot evidence; directory status, group membership and dependencies were not assessed.</p>
            </article>
          </section>
          <section id="refresh" className="scroll-mt-24">
            <SectionTitle eyebrow="Health / data currency" title="Failed last-recorded refreshes" />
            <p className="mb-400 text-300 text-muted-foreground">{metrics.failedRefresh.numerator}/{metrics.failedRefresh.denominator} assessed refreshables failed. {metrics.failedRefresh.denominator} of {semanticModels} inventoried semantic models are represented in refresh coverage. Dates below are historical last attempts; no refresh-cadence SLA is assumed.</p>
            <div className="overflow-x-auto rounded-3xl border border-border bg-card"><table className="w-full text-left text-200"><thead className="bg-muted"><tr>{['Model / workspace', 'Recorded error', 'Last attempt (UTC)', 'Schedule / owner'].map(h => <th key={h} className="p-300 font-semibold">{h}</th>)}</tr></thead><tbody>{snapshot.refreshFailures.map(r => <tr key={r.id} className="border-t border-border">
              <td className="p-300"><strong>{r.name}</strong>{r.endorsed && <span className="ml-200"><Badge critical>Endorsed</Badge></span>}<p className="mt-100 text-muted-foreground">{r.workspace}</p></td>
              <td className="break-all p-300">{r.error}</td><td className="p-300">{formatUtc(r.lastAttempt)}</td><td className="p-300">{r.scheduleEnabled ? 'Enabled' : 'Disabled / not enabled'}<p className="mt-100 break-all text-muted-foreground">{r.configuredBy.join('; ') || 'Owner not supplied'}</p></td>
            </tr>)}</tbody></table></div>
          </section>
          <section id="scope" className="scroll-mt-24">
            <SectionTitle eyebrow="Methodology" title="Scope, clean checks, and blind spots" />
            <div className="grid gap-400 xl:grid-cols-2">
              <article className={panel}><h3 className="text-400 font-semibold">The denominator matters</h3><ul className="mt-300 list-inside list-disc space-y-300 text-300">
                <li>{snapshot.scope.workspaces} governable of {snapshot.scope.allWorkspaces} tenant workspaces. Filter: type=Workspace AND state=Active.</li>
                <li>Excluded: {snapshot.scope.exclusions.map(e => `${e.count} ${e.key}`).join('; ')}.</li>
                <li>{snapshot.scope.inventoryItems} of {snapshot.scope.rawInventoryItems} all-Fabric inventory items retained; {snapshot.scope.excludedItems} outside governable workspaces excluded before percentages.</li>
                <li>{snapshot.scope.labelArtifacts} label-eligible Power BI artifacts; {snapshot.scope.endorsementArtifacts} endorsement-eligible artifacts (dashboards excluded).</li>
                <li>{snapshot.scope.scannedWorkspaces} workspace scan results: {snapshot.scope.workspaces} governable + {snapshot.scope.personalWorkspaces} personal. Personal label gaps are reported separately.</li>
                <li>{snapshot.scope.scanOnlyArtifacts} scanner reports have no matching in-scope admin item ID. Source snapshots and metadata surfaces are not interchangeable.</li>
              </ul><h3 className="mt-500 text-400 font-semibold">Checked and clean</h3><ul className="mt-300 space-y-300">{snapshot.clean.map(text => <li className="flex gap-200 text-300" key={text}><Check className="mt-100 icon-size-200 shrink-0 text-primary" aria-hidden="true" /><span>{text}</span></li>)}</ul></article>
              <article className={panel}><h3 className="text-400 font-semibold">Unassessed does not mean healthy</h3><ul className="mt-300 list-inside list-disc space-y-300 text-200 text-muted-foreground">{snapshot.blindSpots.map(text => <li key={text}>{text}</li>)}</ul></article>
            </div>
            <article className={`${panel} mt-400`}><h3 className="text-400 font-semibold">{isSynthetic ? 'Illustrative source and pagination ledger' : 'Source and pagination ledger'}</h3><div className="mt-400 overflow-x-auto"><table className="w-full text-left text-200"><thead><tr>{['Check', 'Records / pages', 'Collected (UTC)', 'Source'].map(h => <th key={h} className="p-200 font-semibold">{h}</th>)}</tr></thead><tbody>{snapshot.sources.map(s => <tr key={s.name} className="border-t border-border"><td className="p-200 font-semibold">{s.name}<p className="text-muted-foreground">{isSynthetic ? 'Simulated' : s.complete ? 'Complete' : 'Incomplete'}</p></td><td className="p-200">{s.count} / {s.pages}</td><td className="p-200">{formatUtc(s.fetchedAt)}</td><td className="max-w-96 break-all p-200 font-monospace">{s.source}</td></tr>)}</tbody></table></div>
              {snapshot.scanner.map(s => <p key={s.id} className="mt-300 break-all text-200 text-muted-foreground">{isSynthetic ? 'Simulated scan' : 'Metadata scan'} {s.id}: {s.returned}/{s.requested} requested workspace results; {isSynthetic ? 'no service called' : s.complete ? 'Succeeded' : 'Incomplete'}. {isSynthetic ? 'Illustrative result, not a completed tenant scan.' : 'A read-only scan job, not a tenant configuration change.'}</p>)}
            </article>
          </section>
          <footer className="space-y-300 border-t border-border pt-500 text-200 text-muted-foreground"><p>{snapshot.scope.freshness}</p><p>{isSynthetic ? 'Protected synthetic demo - no real tenant data.' : `Protected audit snapshot - Tenant ${snapshot.tenantId}. Imported details retained.`} Not a compliance attestation or live monitoring service.</p><div className="flex flex-wrap gap-400">{snapshot.docs.map(d => <a className="text-primary underline" key={d.url} href={d.url} target="_blank" rel="noopener noreferrer">{d.title}</a>)}</div><p className="flex items-center gap-200"><BookOpen aria-hidden="true" className="icon-size-200" />Ownership before coverage. No automatic remediation.</p></footer>
        </main>
      </div>
    </div>
  );
}
