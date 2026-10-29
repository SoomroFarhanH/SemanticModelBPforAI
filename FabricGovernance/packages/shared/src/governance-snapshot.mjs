function assert(condition, message = 'Snapshot fields or counts are inconsistent. Check the export contract.') {
  if (!condition) throw new Error(message);
}
assert.equal = (actual, expected, message = `Expected ${expected}; received ${actual}. Reconcile related fields in the export contract.`) => assert(actual === expected, message);
assert.deepEqual = (actual, expected, message) => assert(JSON.stringify(actual) === JSON.stringify(expected), message);

export const MAX_SNAPSHOT_BYTES = 25 * 1024 * 1024;
export function parseSnapshot(contents) {
  assert(new TextEncoder().encode(contents).length <= MAX_SNAPSHOT_BYTES, 'Review JSON exceeds the 25 MB import limit.');
  let report;
  try { report = JSON.parse(contents.replace(/^\uFEFF/, '')); }
  catch { throw new Error('Invalid JSON. Select the exported JSON file, not the HTML report or Markdown response.'); }
  assert(report && typeof report === 'object' && !Array.isArray(report), 'Expected a snapshot object.');
  if (report.schemaVersion === undefined) report.schemaVersion = 1;
  if (report.dataClassification === undefined) report.dataClassification = 'tenant';
  validateSnapshot(report);
  if (report.dataClassification === 'synthetic') validateDemoSnapshot(report);
  return report;
}

const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
const count = value => assert(Number.isSafeInteger(value) && value >= 0, 'Counts must be nonnegative safe integers.');
const text = value => assert.equal(typeof value, 'string', 'Expected a string.');
const strings = values => { assert(Array.isArray(values), 'Expected an array.'); values.forEach(text); };
const timestamp = value => { text(value); assert(Number.isFinite(Date.parse(value)), 'Invalid timestamp.'); };
function metric(value) {
  assert(value && typeof value === 'object', 'A metric is required.');
  count(value.numerator); count(value.denominator);
  assert(value.numerator <= value.denominator, 'Numerator exceeds denominator.');
  assert.equal(value.percent, value.denominator ? +(100 * value.numerator / value.denominator).toFixed(1) : 0, 'Metric percentage does not match its counts.');
  text(value.scope); text(value.source);
}
function unique(rows, key) {
  assert.equal(new Set(rows.map(row => row[key])).size, rows.length, `Duplicate ${key}.`);
}
function httpsUrl(value, optional = false) {
  text(value);
  if (optional && !value) return;
  const url = new URL(value);
  assert.equal(url.protocol, 'https:', 'Links must use HTTPS.');
  assert(!url.username && !url.password, 'Do not embed credentials in links.');
}

export function validateSnapshot(report) {
  assert(report && typeof report === 'object' && !Array.isArray(report), 'Expected a snapshot object.');
  assert.equal(report.schemaVersion, 1, 'Unsupported schemaVersion. Export a version 1 governance review.');
  assert.equal(report.readOnly, true, 'Only reviewed read-only snapshots are supported.');
  assert(['synthetic', 'tenant'].includes(report.dataClassification), 'Set dataClassification to synthetic or tenant.');
  for (const key of ['tenantId', 'purpose', 'skill', 'status', 'interpretation']) text(report[key]);
  timestamp(report.collectedFrom); timestamp(report.collectedTo);
  assert(Date.parse(report.collectedFrom) <= Date.parse(report.collectedTo), 'Collection window is reversed.');
  for (const key of ['workspaces', 'capacities', 'domains', 'findings', 'itemTypes', 'labelTypes', 'refreshFailures', 'sources', 'scanner', 'remediation', 'docs']) {
    assert(Array.isArray(report[key]), `Missing array: ${key}.`);
  }
  strings(report.clean); strings(report.blindSpots);
  assert(report.scope && report.metrics, 'Scope and metrics are required.');
  for (const key of ['workspaces', 'allWorkspaces', 'inventoryItems', 'rawInventoryItems', 'excludedItems', 'domains', 'capacities', 'personalWorkspaces', 'scannedWorkspaces', 'labelArtifacts', 'endorsementArtifacts', 'scanOnlyArtifacts']) count(report.scope[key]);
  text(report.scope.freshness);
  assert(Array.isArray(report.scope.exclusions), 'Workspace exclusions are required.');
  for (const row of report.scope.exclusions) { text(row.key); count(row.count); }
  for (const key of ['suspended', 'singleAdmin', 'unlabeled', 'failedRefresh', 'domainAssigned', 'described', 'tagged', 'labeled', 'endorsed']) metric(report.metrics[key]);
  Object.values(report.metrics).forEach(metric);
  for (const row of report.workspaces) {
    for (const key of ['id', 'name', 'domain', 'capacity', 'capacityId', 'capacityState']) text(row[key]);
    if (row.domainId !== undefined) text(row.domainId);
    for (const key of ['adminCount', 'items', 'described', 'tagged']) count(row[key]);
    assert(row.described <= row.items && row.tagged <= row.items, 'Workspace metadata coverage exceeds item count.');
    assert(Array.isArray(row.admins), 'Workspace admins are required.');
    assert.equal(row.adminCount, row.admins.length);
    for (const admin of row.admins) for (const key of ['name', 'type', 'contact']) text(admin[key]);
    assert.equal(row.singleHuman, row.admins.length === 1 && row.admins[0].type === 'User');
    httpsUrl(row.url, true);
  }
  for (const row of report.capacities) {
    for (const key of ['id', 'name', 'sku', 'state']) text(row[key]);
    strings(row.admins); strings(row.workspaceNames);
    assert.equal(typeof row.serviceManagedReserved, 'boolean');
    count(row.workspaceCount); count(row.itemCount);
    const assigned = report.workspaces.filter(w => w.capacityId === row.id);
    assert.equal(row.workspaceCount, assigned.length, 'Capacity workspace count mismatch.');
    assert.equal(row.itemCount, sum(assigned, 'items'), 'Capacity item count mismatch.');
    assert.deepEqual([...row.workspaceNames].sort(), assigned.map(w => w.name).sort());
  }
  const domainNames = report.domains.map(row => row.displayName);
  if (new Set(domainNames).size !== domainNames.length || domainNames.includes('Unassigned')) {
    assert(report.workspaces.every(w => w.domainId !== undefined), 'Ambiguous domain names require observed domainId values on every workspace.');
  }
  for (const row of report.domains) {
    for (const key of ['id', 'displayName', 'description']) text(row[key]);
    strings(row.workspaceNames); strings(row.directAdminContacts);
    count(row.workspaceCount); count(row.adminCount);
    assert.equal(typeof row.entireTenantContributor, 'boolean');
    const assigned = report.workspaces.filter(w => w.domainId !== undefined ? w.domainId === row.id : w.domain === row.displayName);
    assert.equal(row.workspaceCount, assigned.length);
    assert.equal(row.workspaceCount, row.workspaceNames.length);
    assert.deepEqual([...row.workspaceNames].sort(), assigned.map(w => w.name).sort(), 'Domain workspace names do not match workspace records.');
  }
  for (const row of report.itemTypes) {
    text(row.type); count(row.total); count(row.described); count(row.tagged);
    assert(row.described <= row.total && row.tagged <= row.total);
  }
  for (const row of report.labelTypes) { text(row.type); count(row.total); count(row.labeled); assert(row.labeled <= row.total); }
  for (const row of report.refreshFailures) {
    for (const key of ['id', 'name', 'workspace', 'status', 'error']) text(row[key]);
    timestamp(row.lastAttempt); strings(row.configuredBy);
    assert.equal(row.status, 'Failed', 'Only failed last-recorded attempts belong in refreshFailures.');
    assert.equal(typeof row.scheduleEnabled, 'boolean'); assert.equal(typeof row.endorsed, 'boolean');
  }
  for (const row of report.findings) {
    for (const key of ['key', 'title', 'why', 'action', 'owner', 'effort', 'detail']) text(row[key]);
    assert(['Health', 'Protect', 'Trust'].includes(row.pillar), 'Unknown pillar.');
    assert(['Critical', 'High', 'Medium', 'Low'].includes(row.priority), 'Unknown priority.');
    metric(row.evidence); strings(row.examples);
  }
  assert(report.sources.length > 0, 'A source ledger is required.');
  for (const row of report.sources) {
    text(row.name); text(row.source); timestamp(row.fetchedAt); count(row.count); count(row.pages);
    assert.equal(row.complete, true, 'Every source must be fully paginated.');
    assert(row.pages > 0, 'Each source must record its fetched pages, including an empty first page.');
  }
  for (const row of report.scanner) {
    text(row.id); timestamp(row.startedAt); count(row.requested); count(row.returned);
    assert.equal(row.complete, true, 'Scanner coverage is incomplete.');
    assert.equal(row.requested, row.returned, 'Scanner requested/returned mismatch.');
  }
  for (const row of report.remediation) { count(row.step); for (const key of ['title', 'owner', 'action']) text(row[key]); }
  for (const row of report.docs) { text(row.title); httpsUrl(row.url); }
  for (const key of ['workspaces', 'capacities', 'domains', 'refreshFailures', 'scanner']) unique(report[key], 'id');
  unique(report.findings, 'key'); unique(report.itemTypes, 'type'); unique(report.labelTypes, 'type'); unique(report.sources, 'name');
  const { scope, metrics, workspaces, itemTypes, labelTypes } = report;
  assert.equal(scope.workspaces, workspaces.length);
  assert.equal(scope.allWorkspaces, scope.workspaces + sum(scope.exclusions, 'count'));
  assert.equal(scope.domains, report.domains.length); assert.equal(scope.capacities, report.capacities.length);
  assert.equal(scope.inventoryItems, sum(workspaces, 'items')); assert.equal(scope.inventoryItems, sum(itemTypes, 'total'));
  assert.equal(scope.rawInventoryItems, scope.inventoryItems + scope.excludedItems);
  for (const key of ['suspended', 'singleAdmin', 'domainAssigned']) assert.equal(metrics[key].denominator, scope.workspaces);
  for (const key of ['described', 'tagged']) assert.equal(metrics[key].denominator, scope.inventoryItems);
  assert.equal(metrics.suspended.numerator, workspaces.filter(w => w.capacityState === 'Suspended').length);
  assert.equal(metrics.singleAdmin.numerator, workspaces.filter(w => w.singleHuman).length);
  assert.equal(metrics.domainAssigned.numerator, workspaces.filter(w => w.domainId !== undefined ? Boolean(w.domainId) : w.domain !== 'Unassigned').length);
  for (const key of ['described', 'tagged']) { assert.equal(metrics[key].numerator, sum(workspaces, key)); assert.equal(metrics[key].numerator, sum(itemTypes, key)); }
  assert.equal(metrics.failedRefresh.numerator, report.refreshFailures.length);
  assert(metrics.failedRefresh.denominator <= (itemTypes.find(t => t.type === 'SemanticModel')?.total ?? 0), 'Refresh coverage exceeds semantic model inventory.');
  assert.equal(scope.labelArtifacts, sum(labelTypes, 'total'));
  assert.equal(metrics.unlabeled.denominator, scope.labelArtifacts); assert.equal(metrics.labeled.denominator, scope.labelArtifacts);
  assert.equal(metrics.labeled.numerator, sum(labelTypes, 'labeled'));
  assert.equal(metrics.unlabeled.numerator, scope.labelArtifacts - metrics.labeled.numerator);
  assert.equal(metrics.endorsed.denominator, scope.endorsementArtifacts);
  assert.equal(scope.endorsementArtifacts, sum(labelTypes.filter(t => t.type !== 'Dashboard'), 'total'));
  assert.equal(scope.scannedWorkspaces, scope.workspaces + scope.personalWorkspaces);
  assert.equal(scope.scannedWorkspaces, sum(report.scanner, 'returned'));
  assert(!/Bearer\s+[A-Za-z0-9._-]+|"(?:accessToken|refreshToken|clientSecret|password|_authToken)"\s*:/i.test(JSON.stringify(report)), 'Do not bundle credentials.');
  return report;
}

export function validateDemoSnapshot(report) {
  validateSnapshot(report);
  assert.equal(report.dataClassification, 'synthetic', 'Reset to synthetic demo data before public redistribution.');
  assert.equal(report.tenantId, 'SYNTHETIC-DEMO-NOT-A-TENANT');
  for (const rows of [report.workspaces, report.domains, report.capacities, report.refreshFailures, report.scanner]) {
    assert(rows.every(row => row.id.startsWith('demo-')), 'Demo IDs must use the demo- prefix.');
  }
  const serialized = JSON.stringify(report);
  assert(!/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/i.test(serialized), 'GUIDs are not needed in a synthetic demo.');
  for (const email of serialized.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig)) {
    assert(email[0].endsWith('@example.invalid'), 'Use reserved example.invalid contacts in the demo.');
  }
  assert(report.workspaces.every(w => w.url === ''), 'Synthetic workspaces must not link to real Fabric items.');
  return report;
}
