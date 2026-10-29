import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseSnapshot, MAX_SNAPSHOT_BYTES } from './validate-governance-snapshot.mjs';

const source = process.argv[2];
assert(source, 'Provide the path to the reviewed fabric-health-results.json.');
assert(fs.statSync(source).size <= MAX_SNAPSHOT_BYTES, 'Review JSON exceeds the 25 MB import limit.');
const report = parseSnapshot(fs.readFileSync(source, 'utf8'));
fs.writeFileSync(new URL('../packages/frontend/src/data/governance-snapshot.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(`Imported ${report.dataClassification} snapshot: ${report.collectedTo}; ${report.workspaces.length} workspaces; ${report.findings.length} findings.`);
if (report.dataClassification === 'tenant') console.warn('CONFIDENTIAL: original details are retained, not anonymized. Do not commit the bundled snapshot to a public repository. All authorized app viewers can read and download it.');
