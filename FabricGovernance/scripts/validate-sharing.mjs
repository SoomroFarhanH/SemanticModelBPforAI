import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateDemoSnapshot } from './validate-governance-snapshot.mjs';

const root = new URL('../', import.meta.url);
const snapshot = JSON.parse(fs.readFileSync(new URL('packages/frontend/src/data/governance-snapshot.json', root), 'utf8'));
validateDemoSnapshot(snapshot);
const lock = JSON.parse(fs.readFileSync(new URL('package-lock.json', root), 'utf8'));
assert(Object.values(lock.packages).every(p => !p.resolved || !/^https?:/.test(p.resolved)), 'Remove registry-specific resolved URLs before sharing.');
const config = fs.readFileSync(new URL('rayfin/rayfin.yml', root), 'utf8');
assert(/assetAccess:\s*protected/.test(config), 'Keep protected static hosting.');
assert(!/https:\/\//.test(config), 'Do not publish a real hosting redirect or deployment target.');
console.log('Public demo checks passed: synthetic IDs and contacts, consistent metrics, protected config, and registry-neutral lockfile.');
console.log('Also inspect staged files for credentials, environment files, deployment state, and any newly added private data. This check is not a complete secret scanner.');
