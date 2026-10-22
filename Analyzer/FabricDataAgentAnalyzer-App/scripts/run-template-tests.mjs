import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
// Discover node:test suites across the whole template, not just this folder, so
// package-owned tests (for example packages/frontend/scripts) are included.
const templateRoot = path.dirname(scriptsRoot);

const skippedDirectories = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
]);
// Both apply packs to a copy of this app, so they only behave predictably
// before any pack is applied here.
const PRISTINE_ONLY_TESTS = new Set([
  'scaffold.integration.test.mjs',
  'pack-combinations.test.mjs',
]);

function appliedPacks() {
  const manifest = JSON.parse(
    readFileSync(path.join(templateRoot, 'package.json'), 'utf8')
  );
  return Array.isArray(manifest.rayfinPacks) ? manifest.rayfinPacks : [];
}

const packs = appliedPacks();
const skipPristineOnly = packs.length > 0;

function findTestFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      if (entry.name.startsWith('.') || skippedDirectories.has(entry.name)) {
        return [];
      }
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findTestFiles(entryPath);
      if (!entry.name.endsWith('.test.mjs')) return [];
      if (skipPristineOnly && PRISTINE_ONLY_TESTS.has(entry.name)) return [];
      return [entryPath];
    });
}

if (skipPristineOnly) {
  console.log(
    `Skipping scaffolder integration tests: packs already applied (${packs.join(', ')}).`
  );
}

const result = spawnSync(
  process.execPath,
  ['--test', ...findTestFiles(templateRoot)],
  {
    stdio: 'inherit',
  }
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
