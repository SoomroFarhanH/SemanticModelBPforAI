import type { GovernanceSnapshot } from './governance-types';
export const MAX_SNAPSHOT_BYTES: number;
export function parseSnapshot(contents: string): GovernanceSnapshot;
export function validateSnapshot(report: unknown): GovernanceSnapshot;
export function validateDemoSnapshot(report: unknown): GovernanceSnapshot;
