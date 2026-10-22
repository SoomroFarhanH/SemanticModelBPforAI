import type { AnalysisRunRecord, FindingRecord } from '@rayfin-app/shared';

import {
  SEVERITY_META,
  SEVERITY_ORDER,
  cleanRating,
  severityRank,
  statusRank,
} from './analyzer-types';

export type FindingView = 'open' | 'evidence' | 'passed' | 'all';

const OPEN = new Set(['FAIL', 'WARN']);
const NEEDS_EVIDENCE = new Set(['MANUAL', 'UNKNOWN', 'NOT_EVALUATED']);

export function isOpen(finding: Pick<FindingRecord, 'status'>): boolean {
  return OPEN.has(finding.status);
}

export function needsEvidence(finding: Pick<FindingRecord, 'status'>): boolean {
  return NEEDS_EVIDENCE.has(finding.status);
}

export function matchesView(finding: FindingRecord, view: FindingView) {
  switch (view) {
    case 'open':
      return isOpen(finding);
    case 'evidence':
      return needsEvidence(finding);
    case 'passed':
      return finding.status === 'PASS';
    default:
      return true;
  }
}

/** Most severe first; failures before warnings; stable by rule id. */
export function sortBacklog(findings: readonly FindingRecord[]) {
  return [...findings].sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      statusRank(a.status) - statusRank(b.status) ||
      a.ruleId.localeCompare(b.ruleId, undefined, { numeric: true }) ||
      (a.objectPath ?? '').localeCompare(b.objectPath ?? '')
  );
}

export function countBySeverity(findings: readonly FindingRecord[]) {
  const counts: Record<string, number> = {};
  for (const severity of SEVERITY_ORDER) counts[severity] = 0;
  for (const f of findings) {
    if (isOpen(f)) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  }
  return counts;
}

export function countByView(findings: readonly FindingRecord[]) {
  return {
    open: findings.filter(isOpen).length,
    evidence: findings.filter(needsEvidence).length,
    passed: findings.filter((f) => f.status === 'PASS').length,
    all: findings.length,
  } satisfies Record<FindingView, number>;
}

/** Plain-text remediation plan that can be pasted into a ticket or chat. */
export function remediationMarkdown(
  run: Pick<
    AnalysisRunRecord,
    'agentName' | 'rating' | 'readinessPct' | 'coveragePct'
  >,
  findings: readonly FindingRecord[]
): string {
  const lines = [
    `# Remediation plan: ${run.agentName}`,
    '',
    `Rating: ${cleanRating(run.rating)} · Readiness ${
      run.readinessPct ?? 'N/A'
    }% · Coverage ${run.coveragePct ?? 'N/A'}%`,
    '',
  ];

  const sorted = sortBacklog(findings);
  if (sorted.length === 0) {
    lines.push('No items to remediate.');
    return lines.join('\n');
  }

  for (const severity of SEVERITY_ORDER) {
    const group = sorted.filter((f) => f.severity === severity);
    if (group.length === 0) continue;
    lines.push(`## ${SEVERITY_META[severity]?.label ?? severity} (${group.length})`, '');
    for (const f of group) {
      const where = [f.sourceName, f.objectPath].filter(Boolean).join(' › ');
      lines.push(`- [ ] **${f.ruleId}** ${f.title}${where ? ` (${where})` : ''}`);
      if (f.recommendation) lines.push(`  - Fix: ${f.recommendation}`);
      if (f.docsUrl) lines.push(`  - Docs: ${f.docsUrl}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
