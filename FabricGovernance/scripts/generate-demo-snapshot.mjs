import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateDemoSnapshot } from './validate-governance-snapshot.mjs';

const collectedFrom = '2026-01-15T10:00:00.000Z';
const collectedTo = '2026-01-15T10:02:00.000Z';
const metric = (numerator, denominator, scope, source = 'Synthetic example, no API request') => ({
  numerator, denominator, percent: +(100 * numerator / denominator).toFixed(1), scope, source,
});
const seeds = [
  ['Demo Analytics', 'Demo Core', 'demo-capacity-paused', 'Suspended', 1, 6, 3, 2],
  ['Demo Ingestion', 'Unassigned', 'demo-capacity-paused', 'Suspended', 1, 1, 0, 0],
  ['Demo Staging', 'Unassigned', 'demo-capacity-paused', 'Suspended', 1, 0, 0, 0],
  ['Demo Finance', 'Demo Core', 'demo-capacity-active', 'Active', 2, 8, 6, 2],
  ['Demo Operations', 'Demo Core', 'demo-capacity-active', 'Active', 1, 5, 3, 1],
  ['Demo Research', 'Demo Core', 'demo-capacity-active', 'Active', 2, 2, 2, 1],
  ['Demo Sandbox', 'Unassigned', 'demo-capacity-active', 'Active', 1, 0, 0, 0],
  ['Demo Shared', 'Unassigned', 'demo-capacity-unknown', 'Unknown', 2, 2, 1, 0],
];
const workspaces = seeds.map(([name, domain, capacityId, capacityState, adminCount, items, described, tagged], index) => ({
  id: `demo-workspace-${index + 1}`, name, domain, capacityId, capacityState,
  capacity: capacityState === 'Suspended' ? 'Demo Paused Capacity' : capacityState === 'Active' ? 'Demo Active Capacity' : 'Not resolvable',
  adminCount, items, described, tagged, singleHuman: adminCount === 1,
  admins: Array.from({ length: adminCount }, (_, n) => ({
    name: `Demo Owner ${index + 1}-${n + 1}`, type: 'User', contact: `owner-${index + 1}-${n + 1}@example.invalid`,
  })),
  url: '',
}));
const capacities = [
  { id: 'demo-capacity-paused', name: 'Demo Paused Capacity', sku: 'F2', state: 'Suspended', admins: ['Demo Capacity Owner'], serviceManagedReserved: false },
  { id: 'demo-capacity-active', name: 'Demo Active Capacity', sku: 'F8', state: 'Active', admins: ['Demo Capacity Owner', 'Demo Capacity Backup'], serviceManagedReserved: false },
  { id: 'demo-capacity-reserved', name: 'Demo Reserved Capacity', sku: 'PP3', state: 'Active', admins: [], serviceManagedReserved: true },
].map(c => {
  const assigned = workspaces.filter(w => w.capacityId === c.id);
  return { ...c, workspaceCount: assigned.length, workspaceNames: assigned.map(w => w.name), itemCount: assigned.reduce((n, w) => n + w.items, 0) };
});
const domains = [{
  id: 'demo-domain-core', displayName: 'Demo Core', description: '', defaultLabelId: null,
  workspaceCount: 4, workspaceNames: workspaces.filter(w => w.domain === 'Demo Core').map(w => w.name),
  adminCount: 0, entireTenantContributor: true, directAdminContacts: [],
}];
const refreshFailures = [
  { id: 'demo-model-revenue', name: 'Demo Revenue Model', workspace: 'Demo Analytics', status: 'Failed', error: 'CapacityNotActive', lastAttempt: '2026-01-14T05:00:00Z', scheduleEnabled: true, configuredBy: ['owner-1-1@example.invalid'], endorsed: true },
  { id: 'demo-model-stock', name: 'Demo Stock Model', workspace: 'Demo Finance', status: 'Failed', error: 'GatewayOffline', lastAttempt: '2026-01-14T06:00:00Z', scheduleEnabled: true, configuredBy: ['owner-4-1@example.invalid'], endorsed: false },
];
const itemTypes = [
  { type: 'SemanticModel', total: 6, described: 4, tagged: 2 },
  { type: 'Report', total: 5, described: 3, tagged: 1 },
  { type: 'Dashboard', total: 1, described: 0, tagged: 0 },
  { type: 'Notebook', total: 5, described: 4, tagged: 1 },
  { type: 'Lakehouse', total: 4, described: 3, tagged: 1 },
  { type: 'DataPipeline', total: 3, described: 1, tagged: 1 },
];
const metrics = {
  suspended: metric(3, 8, 'Synthetic active standard workspaces'),
  singleAdmin: metric(5, 8, 'Synthetic active standard workspaces'),
  unlabeled: metric(8, 12, 'Synthetic scanner-supported Power BI artifacts'),
  failedRefresh: metric(2, 5, 'Synthetic returned refreshables'),
  domainAssigned: metric(4, 8, 'Synthetic active standard workspaces'),
  described: metric(15, 24, 'Synthetic all-Fabric inventory'),
  tagged: metric(6, 24, 'Synthetic all-Fabric inventory'),
  labeled: metric(4, 12, 'Synthetic scanner-supported Power BI artifacts'),
  endorsed: metric(2, 11, 'Synthetic eligible artifacts, dashboards excluded'),
};
const findings = [];
function finding(key, pillar, priority, title, evidence, why, action, owner, effort, examples, detail = '') {
  findings.push({ key, pillar, priority, title, evidence, why, action, owner, effort, examples, detail });
}
finding('availability', 'Health', 'Critical', 'Example: a suspended capacity hosts production workspaces', metrics.suspended,
  'In a real tenant, capacity-dependent execution may be unavailable while a capacity is suspended. This synthetic example is not an outage report.',
  'Ask the capacity resource owner to verify the current state and approve resumption or reassignment, then validate workloads. Resumption can incur costs.',
  'Capacity resource owner and workspace admins', 'Owner review; approximately 15–30 minutes', capacities[0].workspaceNames);
finding('certified-refresh', 'Health', 'High', 'Example: a certified model has a failed last-recorded refresh',
  metric(1, 1, 'Synthetic certified models'), 'A trusted badge and failed refresh together merit investigation, but do not by themselves prove data is stale.',
  'Verify the recorded error and intended cadence with the model owner; complete and verify a successful refresh.',
  'owner-1-1@example.invalid', 'Model owner triage; approximately 30 minutes', ['Demo Revenue Model — Demo Analytics'], 'Synthetic CapacityNotActive example; no real service was called.');
finding('single-admin', 'Health', 'High', 'Example: workspace administration is concentrated in one person', metrics.singleAdmin,
  'A single directly assigned human admin concentrates recovery and governance responsibility.',
  'Ask the named workspace admins to add a backup or appropriately staffed admin group. Tenant-admin status alone does not grant workspace-role write rights.',
  'Named workspace admins', 'Per-workspace review; approximately 5–10 minutes', workspaces.filter(w => w.singleHuman).map(w => w.name));
finding('domain-owner', 'Health', 'High', 'Example: a populated domain has no explicit Admin', metric(1, 1, 'Synthetic root domains'),
  'Membership and curation lack an explicitly accountable domain owner.',
  'Assign an accountable domain Admin group before expanding membership. Subdomains inherit their parent administrators.',
  'Fabric tenant admin', 'Approximately 15 minutes', ['Demo Core']);
finding('domain-contributors', 'Health', 'High', 'Example: domain contributor scope is EntireTenant', metric(1, 1, 'Synthetic domains'),
  'Broad contributor scope weakens control of domain membership; domain membership is not an item access boundary.',
  'Agree approved contributor groups and narrow scope before bulk workspace assignment.',
  'Tenant and domain admins', 'Approximately 15 minutes plus approval', ['Demo Core']);
finding('failed-refresh', 'Health', 'High', 'Example: last-recorded refresh failures need owner triage', metrics.failedRefresh,
  'Failed last attempts can leave consumers without expected updates; historical error records are not a current workload probe.',
  'Prioritize certified and scheduled models. Verify current capacity, gateway and data-source prerequisites before retrying with approval.',
  'Configured model owners', 'Approximately 30–60 minutes per error family', refreshFailures.map(r => `${r.name} — ${r.workspace}`));
finding('capacity-unknown', 'Health', 'Medium', 'Example: a capacity reference cannot be resolved', metric(1, 8, 'Synthetic active standard workspaces'),
  'The capacity state is unknown, not assumed active or absent.',
  'Have the workspace and capacity owners resolve the reference through approved administration tools.',
  'Workspace and capacity owners', 'Approximately 15 minutes', ['Demo Shared']);
finding('domain-default-label', 'Protect', 'Medium', 'Example: a domain has no default sensitivity label', metric(1, 1, 'Synthetic domains'),
  'New and touched-unlabeled items may lack a domain-level classification baseline.',
  'Agree a label with compliance owners before configuring the default; review dormant unlabeled items separately because they are not automatically backfilled.',
  'Tenant admin with compliance owners', 'Approximately 15–30 minutes after approval', ['Demo Core']);
finding('unlabeled', 'Protect', 'Medium', 'Example: Power BI artifacts need classification review', metrics.unlabeled,
  'Missing labels show a classification-coverage gap, not proof of sensitive-data exposure or a DLP violation.',
  'Prioritize sensitive and authoritative assets, preview the proposed labels and obtain approval before applying them.',
  'Data and compliance owners', 'Classification review before bulk changes', ['Demo Revenue Model', 'Demo Sales Report']);
finding('personal-labels', 'Protect', 'Medium', 'Example: report personal-workspace label coverage separately', metric(2, 2, 'Synthetic artifacts in one personal workspace'),
  'Personal workspaces hold real data in a tenant even though they are excluded from domain-assignment statistics.',
  'Ask the owner to review classification and intended usage. Do not silently include personal workspaces in domain-assignment gaps.',
  'Personal-workspace owner', 'Approximately 15 minutes', ['Demo Personal Report']);
finding('domain-assignment', 'Health', 'Medium', 'Example: some workspaces are outside a domain', metric(4, 8, 'Synthetic active standard workspaces'),
  'The organizational/delegated governance model has incomplete coverage; this is not an access-control finding.',
  'After ownership, contributor scope, keep/review decisions and default labels, dry-run an explicit workspace-ID assignment list. Obtain approval before writing.',
  'Tenant admin or appropriately authorized object admins', 'Bulk review after prerequisites', workspaces.filter(w => w.domain === 'Unassigned').map(w => w.name));
finding('descriptions', 'Trust', 'Medium', 'Example: some Fabric items lack descriptions', metric(9, 24, 'Synthetic all-Fabric inventory'),
  'Consumers may lack context for choosing reusable assets. Presence of text does not establish accuracy.',
  'Choose one named workspace or explicit item list for owner-led curation. Review each proposed change before writing.',
  'Item owners with write rights', 'Approximately 1–3 minutes per reviewed item', ['Demo Stock Model', 'Demo Ingestion Pipeline']);
finding('tags', 'Trust', 'Medium', 'Example: tag coverage needs a bounded rollout', metric(18, 24, 'Synthetic all-Fabric inventory'),
  'Inconsistent tagging reduces discoverability, separate from tag-definition hygiene.',
  'Agree a small applicable taxonomy and obtain item-owner approval for bounded changes. Workspace tags require workspace Admin rights.',
  'Item owners and workspace admins', 'Taxonomy review plus a bounded rollout', ['Demo Research Notebook']);
finding('capacity-admins', 'Health', 'Medium', 'Example: a user-managed capacity has one explicit admin', metric(1, 2, 'Synthetic user-managed capacities; reserved capacity excluded'),
  'Administration is concentrated in one listed principal; group membership was not resolved.',
  'Ask the capacity owner to verify the listed principal and add an accountable backup or staffed group.',
  'Capacity resource / admin-portal owners', 'Approximately 10–15 minutes', ['Demo Paused Capacity']);
finding('empty-workspaces', 'Health', 'Low', 'Example: empty workspaces need keep/review decisions', metric(2, 8, 'Synthetic active standard workspaces'),
  'Zero inventory items does not prove a workspace is unused or safe to remove.',
  'Ask the named admins to keep or review these workspaces. Check activity, deployment stages and inbound dependencies before considering cleanup; do not delete from this signal alone.',
  'Named workspace admins', 'Approximately 10–20 minutes per candidate', ['Demo Staging', 'Demo Sandbox']);
finding('domain-description', 'Health', 'Low', 'Example: a domain lacks a purpose description', metric(1, 1, 'Synthetic domains'),
  'The intended purpose and membership are unclear.',
  'After deciding to retain the domain, have its accountable admins document its purpose.',
  'Tenant or domain admins', 'Approximately 5–10 minutes', ['Demo Core']);
finding('endorsement', 'Trust', 'Low', 'Example: authoritative assets should be intentionally endorsed', metric(9, 11, 'Synthetic endorsement-eligible artifacts'),
  'Consumers may have difficulty identifying approved assets, but not every item should be certified.',
  'Have approved certifiers verify ownership and refresh health before using the portal endorsement process. Do not blanket-certify.',
  'Approved certifiers / item owners', 'Approximately 15–30 minutes per shortlisted asset', ['Demo Sales Report']);
const report = {
  dataClassification: 'synthetic', generatedAt: collectedTo, collectedFrom, collectedTo,
  tenantId: 'SYNTHETIC-DEMO-NOT-A-TENANT', purpose: 'Synthetic demonstration — not a tenant review',
  skill: 'Illustrative OneLake Catalog governance workflow', readOnly: true,
  status: 'Synthetic example: availability risk',
  interpretation: 'This fictional estate demonstrates how to prioritize availability, ownership, protection and discoverability. All names, identities, IDs, counts, dates and findings in this bundled sample are synthetic; no tenant was scanned to create it.',
  scope: {
    workspaces: 8, allWorkspaces: 11, inventoryItems: 24, rawInventoryItems: 29, excludedItems: 5,
    exclusions: [{ key: 'Personal / Active', count: 1 }, { key: 'AdminWorkspace / Active', count: 1 }, { key: 'Workspace / Deleted', count: 1 }],
    domains: 1, capacities: 3, personalWorkspaces: 1, scannedWorkspaces: 9, labelArtifacts: 12, endorsementArtifacts: 11, scanOnlyArtifacts: 0,
    freshness: 'Synthetic fixture with illustrative dates, not a real audit or current tenant state. For actual tenant snapshots, admin insights can lag changes by up to 24 hours; last-refresh records are not current workload probes.',
  },
  metrics, findings, capacities, domains, workspaces, refreshFailures, itemTypes,
  labelTypes: [{ type: 'SemanticModel', total: 6, labeled: 2 }, { type: 'Report', total: 5, labeled: 2 }, { type: 'Dashboard', total: 1, labeled: 0 }],
  errorFamilies: [{ key: 'CapacityNotActive', count: 1 }, { key: 'GatewayOffline', count: 1 }],
  clean: ['Synthetic example: all 8 workspaces have a directly assigned User admin.', 'Synthetic example: no returned capacity is deleting.', 'Synthetic example: the one domain is populated.', 'Synthetic example: no duplicate tag definitions were modeled.'],
  blindSpots: [
    'No real tenant, capacity, identity, item, refresh, or governance policy was queried for this demo.',
    'For real audits, capacity CU, overload and throttling require the Capacity Metrics app; workspace counts are not utilization.',
    'DLP violations and evaluation freshness require the Govern portal or Microsoft Purview; do not infer compliance from label coverage.',
    'No activity-retention analysis, dependency analysis, directory-status or group-membership resolution is included.',
    'Refresh coverage is a subset of semantic models; no cadence/SLA or modification-age threshold is assumed.',
    'Native Fabric types with unverified label metadata remain unassessed. Dashboards are excluded from endorsement eligibility.',
    'Domain branding and default-domain automatic assignment are portal-only. Domain membership does not control item access.',
  ],
  sources: [
    ['workspaces', 8, 1, '/v1/admin/workspaces?type=Workspace&state=Active'],
    ['allWorkspaces', 11, 1, '/v1/admin/workspaces'],
    ['items', 29, 1, '/v1/admin/items?include=defaultIdentity'],
    ['domains', 1, 1, '/v1/admin/domains'],
    ['capacities', 3, 1, 'Power BI admin capacities'],
    ['refreshables', 5, 1, 'Power BI admin refreshables'],
  ].map(([name, count, pages, source]) => ({ name, count, pages, source: `Illustrative only: ${source}; no request made`, complete: true, fetchedAt: collectedFrom })),
  scanner: [{ id: 'demo-scan-no-service-called', complete: true, requested: 9, returned: 9, startedAt: collectedFrom }],
  remediation: [
    { step: 1, title: 'Verify availability and trusted refreshes', owner: 'Capacity and model owners', action: 'Investigate current state and historical error codes; obtain approval before resume, reassignment, or refresh operations.' },
    { step: 2, title: 'Establish accountable ownership', owner: 'Workspace and tenant/domain admins', action: 'Add resilient administration, assign a domain Admin group and narrow contributor scope before expanding membership.' },
    { step: 3, title: 'Review what to keep; agree label defaults', owner: 'Object owners and compliance', action: 'Review empty-workspace intent and dependencies without deletion assumptions. Agree label policy before onboarding more workspaces.' },
    { step: 4, title: 'Expand coverage with bounded approvals', owner: 'Tenant admins and item owners', action: 'Dry-run explicit assignments and label changes. Curate descriptions and tags on one workspace or explicit item list at a time.' },
  ],
  docs: [{ title: 'OneLake catalog governance', url: 'https://learn.microsoft.com/en-us/fabric/governance/onelake-catalog-govern' }, { title: 'Sensitivity labels in Power BI', url: 'https://learn.microsoft.com/en-us/fabric/enterprise/powerbi/service-security-sensitivity-label-overview' }],
};
assert.equal(workspaces.reduce((n, w) => n + w.items, 0), 24);
assert.equal(itemTypes.reduce((n, t) => n + t.total, 0), 24);
assert.equal(findings.length, 17);
validateDemoSnapshot(report);
fs.mkdirSync(new URL('../packages/frontend/src/data/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../packages/frontend/src/data/governance-snapshot.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log('Created deterministic synthetic demo: 8 workspaces, 24 items, 17 illustrative findings. No tenant data read.');
