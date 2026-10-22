/**
 * Browser-safe contracts shared by the data registration package and frontend.
 *
 * Keep each record shape aligned with its decorated runtime entity in
 * `@rayfin-app/data`. This package must stay isomorphic, so do not import the
 * decorated classes here.
 */
export interface AnalysisRunRecord {
  id: string;
  agentName: string;
  workspace?: string | null;
  stage?: string | null;
  runtime?: string | null;
  collectionMode?: string | null;
  analyzerVersion: string;
  generatedAt: Date;
  importedAt: Date;
  readinessPct?: number | null;
  coveragePct?: number | null;
  rating: string;
  ratingComment?: string | null;
  passCount: number;
  warnCount: number;
  failCount: number;
  manualCount: number;
  unknownCount: number;
  gatesJson: string;
  scopesJson: string;
  sourcesJson: string;
  owner_id: string;
}

export interface FindingRecord {
  id: string;
  run_id: string;
  run?: AnalysisRunRecord | null;
  ruleId: string;
  sourceName?: string | null;
  objectPath?: string | null;
  status: string;
  severity: string;
  title: string;
  evidence?: string | null;
  recommendation?: string | null;
  docsUrl?: string | null;
  automation?: string | null;
  owner_id: string;
}

export type UniversalAppSchema = {
  AnalysisRun: AnalysisRunRecord;
  Finding: FindingRecord;
};
