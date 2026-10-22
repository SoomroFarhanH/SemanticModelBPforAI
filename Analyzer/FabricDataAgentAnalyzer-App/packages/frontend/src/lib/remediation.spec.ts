import { describe, expect, it } from 'vitest';

import {
  countBySeverity,
  countByView,
  matchesView,
  remediationMarkdown,
  sortBacklog,
} from './remediation';
import { sampleRecords } from '@/test/fixtures';

const { run, findings } = sampleRecords();

describe('sortBacklog', () => {
  it('orders by severity, then failures before warnings', () => {
    const open = sortBacklog(findings.filter((f) => matchesView(f, 'open')));
    expect(open[0].severity).toBe('BLOCKER');
    const severities = open.map((f) => f.severity);
    const order = ['BLOCKER', 'CRITICAL', 'IMPORTANT', 'RECOMMENDED', 'INFO'];
    expect(severities).toEqual(
      [...severities].sort((a, b) => order.indexOf(a) - order.indexOf(b))
    );
    const important = open.filter((f) => f.severity === 'IMPORTANT');
    const firstWarn = important.findIndex((f) => f.status === 'WARN');
    const lastFail = important.map((f) => f.status).lastIndexOf('FAIL');
    expect(lastFail).toBeLessThan(firstWarn);
  });

  it('does not mutate its input', () => {
    const copy = [...findings];
    sortBacklog(findings);
    expect(findings).toEqual(copy);
  });
});

describe('views and counts', () => {
  it('splits findings into open, evidence-needed and passed', () => {
    const counts = countByView(findings);
    expect(counts.all).toBe(29);
    expect(counts.open + counts.evidence + counts.passed).toBe(29);
    expect(counts.open).toBe(
      findings.filter((f) => f.status === 'FAIL' || f.status === 'WARN').length
    );
  });

  it('counts only open findings per severity', () => {
    const counts = countBySeverity(findings);
    expect(counts.BLOCKER).toBe(1);
    expect(counts.CRITICAL).toBe(3);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(
      countByView(findings).open
    );
  });
});

describe('remediationMarkdown', () => {
  it('renders a checklist grouped by severity with fixes and docs', () => {
    const open = findings.filter((f) => matchesView(f, 'open'));
    const text = remediationMarkdown(run, open);
    expect(text).toMatch(/^# Remediation plan: SAMPLE/);
    expect(text).toContain('Rating: NOT READY · Readiness 50% · Coverage 75%');
    expect(text).toContain('## Blocker (1)');
    expect(text).toContain('- [ ] **SM-019** AI Data Schema is configured');
    expect(text).toContain('  - Fix: Add agent instructions');
    expect(text.indexOf('## Blocker')).toBeLessThan(text.indexOf('## Critical'));
  });

  it('says so when there is nothing to fix', () => {
    expect(remediationMarkdown(run, [])).toContain('No items to remediate.');
  });
});
