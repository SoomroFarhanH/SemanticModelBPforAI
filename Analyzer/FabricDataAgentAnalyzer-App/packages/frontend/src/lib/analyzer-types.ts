/** Visual tone shared by status pills, severity rails and score colors. */
export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'muted';

export const STATUS_ORDER = [
  'FAIL',
  'WARN',
  'MANUAL',
  'UNKNOWN',
  'NOT_EVALUATED',
  'PASS',
] as const;

export const SEVERITY_ORDER = [
  'BLOCKER',
  'CRITICAL',
  'IMPORTANT',
  'RECOMMENDED',
  'INFO',
] as const;

export type Severity = (typeof SEVERITY_ORDER)[number];

export const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  PASS: { label: 'Pass', tone: 'good' },
  WARN: { label: 'Warning', tone: 'warn' },
  FAIL: { label: 'Fail', tone: 'bad' },
  MANUAL: { label: 'Manual check', tone: 'info' },
  UNKNOWN: { label: 'Unknown', tone: 'muted' },
  NOT_EVALUATED: { label: 'Not evaluated', tone: 'muted' },
};

export const SEVERITY_META: Record<string, { label: string; tone: Tone }> = {
  BLOCKER: { label: 'Blocker', tone: 'bad' },
  CRITICAL: { label: 'Critical', tone: 'bad' },
  IMPORTANT: { label: 'Important', tone: 'warn' },
  RECOMMENDED: { label: 'Recommended', tone: 'info' },
  INFO: { label: 'Info', tone: 'muted' },
};

export function severityRank(severity: string): number {
  const index = (SEVERITY_ORDER as readonly string[]).indexOf(severity);
  return index === -1 ? SEVERITY_ORDER.length : index;
}

export function statusRank(status: string): number {
  const index = (STATUS_ORDER as readonly string[]).indexOf(status);
  return index === -1 ? STATUS_ORDER.length : index;
}

export interface Gate {
  gate: string;
  status: string;
  evidence: string;
}

export interface ScopeScore {
  scope: string;
  readiness: number | null;
  coverage: number | null;
  pass: number;
  warn: number;
  fail: number;
  manual: number;
  unknown: number;
  notEvaluated: number;
}

export interface SourceInfo {
  name: string;
  kind: string;
  family: string;
  rawType: string;
  selectedCount: number;
  exampleCount: number;
  preview: boolean;
  hasInstructions: boolean;
}

/** Fields of a run a parsed export can supply, before ownership is stamped. */
export interface NewRun {
  agentName: string;
  workspace?: string;
  stage?: string;
  runtime?: string;
  collectionMode?: string;
  analyzerVersion: string;
  generatedAt: Date;
  readinessPct?: number;
  coveragePct?: number;
  rating: string;
  ratingComment?: string;
  passCount: number;
  warnCount: number;
  failCount: number;
  manualCount: number;
  unknownCount: number;
  gatesJson: string;
  scopesJson: string;
  sourcesJson: string;
}

export interface NewFinding {
  ruleId: string;
  sourceName?: string;
  objectPath?: string;
  status: string;
  severity: string;
  title: string;
  evidence?: string;
  recommendation?: string;
  docsUrl?: string;
  automation?: string;
}

export interface ParsedBundle {
  run: NewRun;
  findings: NewFinding[];
  /** Non-fatal notes about data that had to be trimmed. */
  warnings: string[];
}

/** Strips the leading emoji the analyzer puts on its rating text. */
export function cleanRating(rating: string): string {
  return rating.replace(/^[^A-Za-z0-9]+/, '').trim();
}

export function ratingTone(rating: string): Tone {
  const text = cleanRating(rating).toUpperCase();
  if (text.startsWith('NOT READY')) return 'bad';
  if (text.startsWith('READY')) return 'good';
  if (text.startsWith('MOSTLY')) return 'good';
  if (text.startsWith('INCOMPLETE') || text.startsWith('NEEDS')) return 'warn';
  return 'muted';
}

export function safeJsonArray<T>(text: string): T[] {
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}
