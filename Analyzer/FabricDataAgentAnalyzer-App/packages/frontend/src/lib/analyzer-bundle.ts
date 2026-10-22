import type {
  Gate,
  NewFinding,
  NewRun,
  ParsedBundle,
  ScopeScore,
  SourceInfo,
} from './analyzer-types';

/** Raised for input that is not a usable analyzer export. Message is user-facing. */
export class BundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BundleError';
  }
}

/** Upper bound on stored findings so one import cannot run away. */
export const MAX_FINDINGS = 600;

/** Stored JSON columns are bounded text; stay clear of the 4000 limit. */
const JSON_LIMIT = 3900;

type Dict = Record<string, unknown>;

function isRecord(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** 0..1 fraction -> whole percent, or undefined when absent. */
function fractionToPct(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

/** Scope rows carry display strings such as "87%" or "N/A". */
function labelToPct(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value <= 1 ? value * 100 : value);
  }
  if (typeof value !== 'string') return null;
  const match = /(-?\d+(?:\.\d+)?)\s*%/.exec(value);
  return match ? Math.round(Number(match[1])) : null;
}

function shrinkStrings<T>(value: T, cap: number): T {
  if (typeof value === 'string') {
    return (value.length > cap ? `${value.slice(0, cap - 1)}…` : value) as T;
  }
  if (Array.isArray(value)) return value.map((v) => shrinkStrings(v, cap)) as T;
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, shrinkStrings(v, cap)])
    ) as T;
  }
  return value;
}

/**
 * Serializes rows into a bounded text column: first trims long strings, then
 * drops trailing rows. `dropped` reports how many rows did not fit.
 */
function fitJson<T>(rows: T[]): { json: string; dropped: number } {
  for (const cap of [Infinity, 200, 120, 60, 30]) {
    const json = JSON.stringify(shrinkStrings(rows, cap));
    if (json.length <= JSON_LIMIT) return { json, dropped: 0 };
  }
  for (let keep = rows.length - 1; keep >= 0; keep--) {
    const json = JSON.stringify(shrinkStrings(rows.slice(0, keep), 30));
    if (json.length <= JSON_LIMIT) return { json, dropped: rows.length - keep };
  }
  return { json: '[]', dropped: rows.length };
}

const STATUSES = new Set([
  'PASS',
  'WARN',
  'FAIL',
  'MANUAL',
  'UNKNOWN',
  'NOT_EVALUATED',
  'NOT_APPLICABLE',
]);

const SEVERITIES = new Set([
  'BLOCKER',
  'CRITICAL',
  'IMPORTANT',
  'RECOMMENDED',
  'INFO',
]);

function normalizeEnum(value: unknown, allowed: Set<string>, fallback: string) {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return allowed.has(text) ? text : fallback;
}

function parseGates(value: unknown): Gate[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((g) => ({
    gate: clip(g.gate, 200) ?? 'Unnamed gate',
    status: normalizeEnum(
      typeof g.status === 'string' ? g.status.replace('/', '') : g.status,
      new Set(['PASS', 'FAIL', 'UNKNOWN', 'NA']),
      'UNKNOWN'
    ),
    evidence: clip(g.evidence, 400) ?? '',
  }));
}

function parseScopes(value: unknown): ScopeScore[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((s) => ({
    scope: clip(s.scope, 120) ?? 'Scope',
    readiness: labelToPct(s.readiness),
    coverage: labelToPct(s.coverage),
    pass: num(s.PASS),
    warn: num(s.WARN),
    fail: num(s.FAIL),
    manual: num(s.MANUAL),
    unknown: num(s.UNKNOWN),
    notEvaluated: num(s.NOT_EVALUATED),
  }));
}

function parseSources(value: unknown): SourceInfo[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((s) => ({
    name: clip(s.display_name, 120) ?? 'Source',
    kind: clip(s.source_kind, 40) ?? 'UNKNOWN',
    family: clip(s.source_family, 30) ?? 'UNKNOWN',
    rawType: clip(s.source_type_raw, 40) ?? '',
    selectedCount: Array.isArray(s.selected_objects)
      ? s.selected_objects.length
      : 0,
    exampleCount: num(s.example_query_count),
    preview: s.preview === true,
    hasInstructions: s.has_instructions === true,
  }));
}

function parseFindings(value: unknown): NewFinding[] {
  const findings: NewFinding[] = [];
  for (const f of value as unknown[]) {
    if (!isRecord(f)) continue;
    const status = normalizeEnum(f.status, STATUSES, 'UNKNOWN');
    if (status === 'NOT_APPLICABLE') continue;
    const ruleId = clip(f.rule_id, 40) ?? 'UNKNOWN';
    findings.push({
      ruleId,
      sourceName: clip(f.source_name, 200),
      objectPath: clip(f.object_path, 400),
      status,
      severity: normalizeEnum(f.severity, SEVERITIES, 'INFO'),
      title: clip(f.title, 300) ?? ruleId,
      evidence: clip(f.evidence, 1500),
      recommendation: clip(f.recommendation, 1500),
      docsUrl: clip(f.docs_url, 500),
      automation: clip(f.automation, 40),
    });
  }
  return findings;
}

/**
 * Parses the `*_evidence.json` bundle the Fabric Data Agent Analyzer notebook
 * writes, and normalizes it into the shapes the app stores.
 */
export function parseAnalyzerBundle(text: string): ParsedBundle {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new BundleError(
      'That is not valid JSON. Choose the *_evidence.json file the analyzer notebook exported.'
    );
  }

  if (
    !isRecord(raw) ||
    !isRecord(raw.scorecard) ||
    !Array.isArray(raw.findings)
  ) {
    throw new BundleError(
      'This does not look like an analyzer evidence export: it is missing "scorecard" or "findings". Choose the *_evidence.json file, not the CSV, Markdown or HTML report.'
    );
  }

  const warnings: string[] = [];
  const scorecard = raw.scorecard;
  const agent = isRecord(raw.agent) ? raw.agent : {};

  let findings = parseFindings(raw.findings);
  if (findings.length > MAX_FINDINGS) {
    warnings.push(
      `Only the first ${MAX_FINDINGS} of ${findings.length} findings were kept.`
    );
    findings = findings.slice(0, MAX_FINDINGS);
  }

  const scopes = parseScopes(scorecard.scopes);
  const overall = scopes.find((s) => s.scope.toUpperCase() === 'OVERALL');
  const scored = (status: string) =>
    findings.filter((f) => f.status === status).length;

  const gates = fitJson(parseGates(scorecard.gates));
  const scopesOut = fitJson(scopes);
  const sources = fitJson(parseSources(raw.sources));
  if (gates.dropped || scopesOut.dropped || sources.dropped) {
    warnings.push(
      'Some release-gate, scope or source rows were too large to store and were left out.'
    );
  }

  const generated = new Date(String(raw.generated_utc ?? ''));
  const readiness = fractionToPct(scorecard.readiness);
  const coverage = fractionToPct(scorecard.coverage);

  const run: NewRun = {
    agentName: clip(agent.name, 200) ?? 'Unnamed data agent',
    workspace: clip(agent.workspace, 200),
    stage: clip(agent.stage, 100),
    runtime: clip(agent.runtime, 100),
    collectionMode: clip(agent.collection_mode, 100),
    analyzerVersion: clip(raw.analyzer_version, 40) ?? 'unknown',
    generatedAt: Number.isNaN(generated.getTime()) ? new Date() : generated,
    readinessPct: readiness,
    coveragePct: coverage,
    rating: clip(scorecard.rating, 100) ?? 'No rating',
    ratingComment: clip(scorecard.comment, 500),
    passCount: overall?.pass ?? scored('PASS'),
    warnCount: overall?.warn ?? scored('WARN'),
    failCount: overall?.fail ?? scored('FAIL'),
    manualCount: overall?.manual ?? scored('MANUAL'),
    unknownCount:
      (overall?.unknown ?? scored('UNKNOWN')) +
      (overall?.notEvaluated ?? scored('NOT_EVALUATED')),
    gatesJson: gates.json,
    scopesJson: scopesOut.json,
    sourcesJson: sources.json,
  };

  return { run, findings, warnings };
}
