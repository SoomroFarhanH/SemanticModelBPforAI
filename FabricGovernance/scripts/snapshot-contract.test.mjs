import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateSnapshot, validateDemoSnapshot } from './validate-governance-snapshot.mjs';

const root = new URL('../', import.meta.url);
const snapshotFile = new URL('packages/frontend/src/data/governance-snapshot.json', root);
const original = fs.readFileSync(snapshotFile);
const report = JSON.parse(original);
const copy = () => structuredClone(report);

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
