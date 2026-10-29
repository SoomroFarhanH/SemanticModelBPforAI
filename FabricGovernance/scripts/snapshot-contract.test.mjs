import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateSnapshot, validateDemoSnapshot, parseSnapshot, MAX_SNAPSHOT_BYTES } from './validate-governance-snapshot.mjs';
import { createRequire } from 'node:module';

const root = new URL('../', import.meta.url);
const snapshotFile = new URL('packages/frontend/src/data/governance-snapshot.json', root);
const original = fs.readFileSync(snapshotFile);
const report = JSON.parse(original);
const copy = () => structuredClone(report);

test('the published JSON schema validates the bundled export and rejects missing fields', () => {
  const require = createRequire(new URL('packages/frontend/package.json', root));
  const Ajv = require('ajv');
  const schema = JSON.parse(fs.readFileSync(new URL('packages/shared/src/governance-review.schema.json', root), 'utf8'));
  const ajv = new Ajv({ formats: { 'date-time': { type: 'string', validate: value => Number.isFinite(Date.parse(value)) } } });
  const validate = ajv.compile(schema);
  assert(validate(report), JSON.stringify(validate.errors));
  const invalid = copy(); delete invalid.scope.freshness;
  assert.equal(validate(invalid), false);
});
test('the browser/CLI parser rejects malformed, oversized and unsupported exports', () => {
  assert.throws(() => parseSnapshot('<html>not JSON</html>'), /Invalid JSON/);
  assert.throws(() => parseSnapshot(' '.repeat(MAX_SNAPSHOT_BYTES + 1)), /25 MB/);
  const newer = copy(); newer.schemaVersion = 2;
  assert.throws(() => parseSnapshot(JSON.stringify(newer)), /schemaVersion/);
  assert.throws(() => parseSnapshot('[]'), /snapshot object/);
});
test('legacy exports normalize explicitly to version 1 tenant data', () => {
  const legacy = copy(); delete legacy.dataClassification; delete legacy.schemaVersion;
  const normalized = parseSnapshot('\uFEFF' + JSON.stringify(legacy));
  assert.equal(normalized.schemaVersion, 1);
  assert.equal(normalized.dataClassification, 'tenant');
});

test('bundled snapshot has internally consistent evidence', () => {
  assert.equal(validateSnapshot(report), report);
  if (report.dataClassification === 'synthetic') validateDemoSnapshot(report);
});
test('rejects inconsistent percentages and item totals', () => {
  const percent = copy(); percent.metrics.unlabeled.percent += 1;
  assert.throws(() => validateSnapshot(percent), /percentage/);
  const items = copy(); items.scope.inventoryItems += 1;
  assert.throws(() => validateSnapshot(items));
});
test('rejects partial pagination and incomplete scanner results', () => {
  const partial = copy(); partial.sources[0].complete = false;
  assert.throws(() => validateSnapshot(partial), /fully paginated/);
  const scan = copy(); scan.scanner = [{ id: 'demo-incomplete', startedAt: report.collectedFrom, complete: true, requested: 2, returned: 1 }];
  assert.throws(() => validateSnapshot(scan), /requested\/returned/);
});
test('rejects malformed types, duplicate IDs and reversed timestamps', () => {
  const types = copy(); types.workspaces = 'invalid';
  assert.throws(() => validateSnapshot(types), /Missing array/);
  const duplicates = copy(); duplicates.sources.push(duplicates.sources[0]);
  assert.throws(() => validateSnapshot(duplicates), /Duplicate/);
  const dates = copy(); [dates.collectedFrom, dates.collectedTo] = ['2026-02-01', '2026-01-01'];
  assert.throws(() => validateSnapshot(dates), /reversed/);
});
test('rejects credentials and executable links before bundling', () => {
  const secret = copy(); secret.clientSecret = 'not-a-real-credential';
  assert.throws(() => validateSnapshot(secret), /credentials/);
  const url = copy(); url.docs[0].url = 'javascript:alert(1)';
  assert.throws(() => validateSnapshot(url), /HTTPS/);
});
test('zero-denominator metrics must have zero percentage', () => {
  const empty = copy(); empty.findings = [{ ...report.findings[0], evidence: { numerator: 0, denominator: 0, percent: 0, scope: 'No eligible records', source: 'Test' } }];
  validateSnapshot(empty);
  empty.findings[0].evidence.percent = 100;
  assert.throws(() => validateSnapshot(empty), /percentage/);
});
test('a tenant snapshot cannot pass public-demo checks', () => {
  const tenant = copy(); tenant.dataClassification = 'tenant';
  assert.throws(() => validateDemoSnapshot(tenant), /synthetic/);
});
test('domain membership uses observed IDs instead of ambiguous display names', () => {
  const duplicate = copy();
  duplicate.domains.push({ ...duplicate.domains[0], id: 'demo-second-domain', workspaceCount: 0, workspaceNames: [] });
  duplicate.scope.domains += 1;
  validateSnapshot(duplicate);
  for (const workspace of duplicate.workspaces) delete workspace.domainId;
  assert.throws(() => validateSnapshot(duplicate), /Ambiguous domain names/);
});
test('a rejected CLI import leaves the existing bundled snapshot unchanged', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'governance-import-test-'));
  try {
    const input = copy(); input.sources[0].complete = false;
    const file = path.join(directory, 'invalid.json');
    fs.writeFileSync(file, JSON.stringify(input));
    const child = spawnSync(process.execPath, [fileURLToPath(new URL('scripts/import-governance-snapshot.mjs', root)), file], { encoding: 'utf8' });
    assert.equal(child.status, 1, child.stderr);
    assert.match(child.stderr, /fully paginated/);
    assert.deepEqual(fs.readFileSync(snapshotFile), original);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
test('a valid legacy CLI import is marked tenant without modifying the shared fixture', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'governance legacy import '));
  try {
    const scripts = path.join(directory, 'scripts');
    const data = path.join(directory, 'packages', 'frontend', 'src', 'data');
    fs.mkdirSync(scripts);
    fs.mkdirSync(data, { recursive: true });
    const shared = path.join(directory, 'packages', 'shared', 'src');
    fs.mkdirSync(shared, { recursive: true });
    fs.copyFileSync(new URL('packages/shared/src/governance-snapshot.mjs', root), path.join(shared, 'governance-snapshot.mjs'));
    for (const file of ['import-governance-snapshot.mjs', 'validate-governance-snapshot.mjs']) {
      fs.copyFileSync(new URL(`scripts/${file}`, root), path.join(scripts, file));
    }
    const input = copy(); delete input.dataClassification;
    const file = path.join(directory, 'reviewed.json');
    fs.writeFileSync(file, JSON.stringify(input));
    const child = spawnSync(process.execPath, [path.join(scripts, 'import-governance-snapshot.mjs'), file], { encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    assert.match(child.stderr, /CONFIDENTIAL/);
    const imported = JSON.parse(fs.readFileSync(path.join(data, 'governance-snapshot.json'), 'utf8'));
    assert.equal(imported.dataClassification, 'tenant');
    assert.equal(imported.workspaces.length, report.workspaces.length);
    validateSnapshot(imported);
    assert.deepEqual(fs.readFileSync(snapshotFile), original);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
test('the client validation command works without node_modules or any Rayfin SDK install', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'governance no sdk '));
  try {
    const scripts = path.join(directory, 'scripts');
    const shared = path.join(directory, 'packages', 'shared', 'src');
    fs.mkdirSync(scripts);
    fs.mkdirSync(shared, { recursive: true });
    for (const file of ['validate-review-file.mjs', 'validate-governance-snapshot.mjs']) {
      fs.copyFileSync(new URL(`scripts/${file}`, root), path.join(scripts, file));
    }
    fs.copyFileSync(new URL('packages/shared/src/governance-snapshot.mjs', root), path.join(shared, 'governance-snapshot.mjs'));
    const file = path.join(directory, 'review.json');
    fs.writeFileSync(file, original);
    const child = spawnSync(process.execPath, [path.join(scripts, 'validate-review-file.mjs'), file], { encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    assert.match(child.stdout, /Valid governance review v1/);
    assert.equal(fs.existsSync(path.join(directory, 'node_modules')), false);
    assert.equal(fs.existsSync(path.join(directory, 'packages', 'frontend')), false);
    assert.deepEqual(fs.readFileSync(file), original);
    assert.deepEqual(fs.readFileSync(snapshotFile), original);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
