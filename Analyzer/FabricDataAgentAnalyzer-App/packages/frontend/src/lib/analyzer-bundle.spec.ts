import { describe, expect, it } from 'vitest';

import { BundleError, parseAnalyzerBundle } from './analyzer-bundle';
import type { Gate, ScopeScore } from './analyzer-types';
import { safeJsonArray } from './analyzer-types';
import { sampleParsed, sampleText } from '@/test/fixtures';

function bundle(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    analyzer_version: '3.0.0',
    generated_utc: '2026-10-21T14:02:30+00:00',
    agent: { name: 'Agent A' },
    scorecard: { readiness: 0.8, coverage: 0.9, rating: '🟡 MOSTLY READY' },
    findings: [],
    ...overrides,
  });
}

describe('parseAnalyzerBundle', () => {
  it('reads the headline score, rating and agent from a real export shape', () => {
    const { run } = sampleParsed();
    expect(run.agentName).toContain('SAMPLE');
    expect(run.readinessPct).toBe(50);
    expect(run.coveragePct).toBe(75);
    expect(run.rating).toContain('NOT READY');
    expect(run.analyzerVersion).toBe('3.0.0');
    expect(run.generatedAt.toISOString()).toBe('2026-10-21T14:02:30.000Z');
  });

  it('drops not-applicable checks and keeps every other finding', () => {
    const { findings } = sampleParsed();
    expect(findings).toHaveLength(29);
    expect(findings.some((f) => f.status === 'NOT_APPLICABLE')).toBe(false);
    expect(findings.find((f) => f.ruleId === 'DA-002')).toMatchObject({
      status: 'FAIL',
      severity: 'CRITICAL',
    });
  });

  it('takes outcome counts from the overall scope row', () => {
    const { run } = sampleParsed();
    const scopes = safeJsonArray<ScopeScore>(run.scopesJson);
    const overall = scopes.find((s) => s.scope === 'OVERALL')!;
    expect(run.failCount).toBe(overall.fail);
    expect(run.warnCount).toBe(overall.warn);
    expect(run.passCount).toBe(overall.pass);
    expect(overall.readiness).toBe(50);
    expect(overall.coverage).toBe(75);
  });

  it('keeps release gates, with the N/A status normalized', () => {
    const { run } = sampleParsed();
    const gates = safeJsonArray<Gate>(run.gatesJson);
    expect(gates).toHaveLength(10);
    expect(gates[0]).toMatchObject({ status: 'FAIL' });
    const na = parseAnalyzerBundle(
      bundle({
        scorecard: {
          readiness: 1,
          rating: 'x',
          gates: [{ gate: 'G', status: 'N/A', evidence: '' }],
        },
      })
    );
    expect(safeJsonArray<Gate>(na.run.gatesJson)[0].status).toBe('NA');
  });

  it('keeps stored JSON columns inside the 4000 character limit', () => {
    const makeGates = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        gate: `Gate ${i}`,
        status: 'PASS',
        evidence: 'x'.repeat(900),
      }));

    // Long text is trimmed first, so every row survives and nothing is reported.
    const trimmed = parseAnalyzerBundle(
      bundle({ scorecard: { readiness: 1, rating: 'r', gates: makeGates(40) } })
    );
    expect(trimmed.run.gatesJson.length).toBeLessThanOrEqual(3900);
    expect(safeJsonArray<Gate>(trimmed.run.gatesJson)).toHaveLength(40);
    expect(trimmed.warnings).toEqual([]);

    // Too many rows even when trimmed: rows are dropped and the user is told.
    const dropped = parseAnalyzerBundle(
      bundle({ scorecard: { readiness: 1, rating: 'r', gates: makeGates(400) } })
    );
    expect(dropped.run.gatesJson.length).toBeLessThanOrEqual(3900);
    expect(
      safeJsonArray<Gate>(dropped.run.gatesJson).length
    ).toBeLessThan(400);
    expect(dropped.warnings.join(' ')).toMatch(/too large/);

    expect(sampleParsed().run.sourcesJson.length).toBeLessThanOrEqual(3900);
  });

  it('clips long text to the stored column sizes', () => {
    const { findings } = parseAnalyzerBundle(
      bundle({
        findings: [
          {
            rule_id: 'R-1',
            status: 'fail',
            severity: 'critical',
            title: 't'.repeat(900),
            evidence: 'e'.repeat(5000),
          },
        ],
      })
    );
    expect(findings[0].title).toHaveLength(300);
    expect(findings[0].evidence).toHaveLength(1500);
    expect(findings[0].status).toBe('FAIL');
    expect(findings[0].severity).toBe('CRITICAL');
  });

  it('treats a missing score as not available rather than zero', () => {
    const { run } = parseAnalyzerBundle(
      bundle({ scorecard: { readiness: null, coverage: null, rating: 'r' } })
    );
    expect(run.readinessPct).toBeUndefined();
    expect(run.coveragePct).toBeUndefined();
  });

  it('caps the number of stored findings and says so', () => {
    const many = Array.from({ length: 650 }, (_, i) => ({
      rule_id: `R-${i}`,
      status: 'FAIL',
      severity: 'INFO',
      title: 't',
    }));
    const { findings, warnings } = parseAnalyzerBundle(
      bundle({ findings: many })
    );
    expect(findings).toHaveLength(600);
    expect(warnings[0]).toMatch(/first 600 of 650/);
  });

  it('accepts a UTF-8 byte-order mark', () => {
    expect(() => parseAnalyzerBundle('\uFEFF' + sampleText())).not.toThrow();
  });

  it('explains non-JSON input', () => {
    expect(() => parseAnalyzerBundle('rule_id,status\nDA-001,PASS')).toThrow(
      BundleError
    );
    expect(() => parseAnalyzerBundle('<html></html>')).toThrow(/valid JSON/);
  });

  it('explains JSON that is not an analyzer export', () => {
    expect(() => parseAnalyzerBundle('{"a":1}')).toThrow(/scorecard/);
    expect(() => parseAnalyzerBundle('[]')).toThrow(BundleError);
  });
});
