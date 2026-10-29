import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseSnapshot, MAX_SNAPSHOT_BYTES } from './validate-governance-snapshot.mjs';

const source = process.argv[2];
assert(source, 'Usage: npm run snapshot:validate -- <path-to-reviewed-json>');
assert(fs.statSync(source).size <= MAX_SNAPSHOT_BYTES, 'Review JSON exceeds the 25 MB import limit.');
const report = parseSnapshot(fs.readFileSync(source, 'utf8'));
console.log(`Valid governance review v${report.schemaVersion}: ${report.dataClassification}; ${report.workspaces.length} workspaces; ${report.findings.length} findings. No files changed.`);
