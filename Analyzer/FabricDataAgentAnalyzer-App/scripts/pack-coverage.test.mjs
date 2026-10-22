// Every capability pack must belong to an E2E test pack. This keeps a newly
// added pack from silently falling outside the Universal App test matrix.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const TEMPLATE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = join(TEMPLATE, '.agents', 'skills');
const COVERAGE_PATH = join(TEMPLATE, 'scripts', 'e2e-pack-coverage.json');
const workspaces = [];

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

function capabilityPackNames(skillsRoot = SKILLS) {
  return readdirSync(skillsRoot)
    .flatMap((directory) => {
      const manifestPath = join(skillsRoot, directory, 'pack.json');
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        return [manifest.name ?? directory];
      } catch (error) {
        if (error?.code === 'ENOENT') return [];
        throw error;
      }
    })
    .sort();
}

function readCoverage(path = COVERAGE_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function validatePackCoverage(capabilityPacks, coverage) {
  const testPacks = coverage?.testPacks;
  assert.ok(Array.isArray(testPacks), 'coverage must contain testPacks[]');

  const testPackNames = testPacks.map(({ name }) => name);
  assert.equal(
    new Set(testPackNames).size,
    testPackNames.length,
    'E2E test pack names must be unique'
  );

  const registered = new Set(
    testPacks.flatMap(({ capabilityPacks: packs }) => packs ?? [])
  );
  const missing = capabilityPacks.filter((pack) => !registered.has(pack));
  const unknown = [...registered].filter(
    (pack) => !capabilityPacks.includes(pack)
  );

  assert.deepEqual(
    missing,
    [],
    `Capability packs missing E2E test pack coverage: ${missing.join(', ')}`
  );
  assert.deepEqual(
    unknown,
    [],
    `E2E test packs reference unknown capability packs: ${unknown.join(', ')}`
  );
}

function makeApp() {
  const dir = mkdtempSync(join(os.tmpdir(), 'pack-coverage-'));
  workspaces.push(dir);
  cpSync(TEMPLATE, dir, {
    recursive: true,
    filter: (src) =>
      !/[\\/](node_modules|dist|\.git|\.rayfin)([\\/]|$)/u.test(src),
  });
  return dir;
}

function applyPack(dir, pack) {
  return execFileSync(
    process.execPath,
    [join(dir, 'scripts', 'scaffold.mjs'), pack, '--no-install'],
    { cwd: dir, encoding: 'utf8' }
  );
}

test('every capability pack is registered in an E2E test pack', () => {
  validatePackCoverage(capabilityPackNames(), readCoverage());
});

test('coverage fails when a capability pack is not registered', () => {
  assert.throws(
    () =>
      validatePackCoverage(
        [...capabilityPackNames(), 'unregistered-capability'],
        readCoverage()
      ),
    /missing E2E test pack coverage: unregistered-capability/u
  );
});

for (const pack of capabilityPackNames()) {
  test(`${pack} applies and reapplies to a fresh app`, () => {
    const dir = makeApp();
    applyPack(dir, pack);
    applyPack(dir, pack);

    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    assert.ok(pkg.rayfinPacks.includes(pack), `${pack} was not recorded`);
  });
}
