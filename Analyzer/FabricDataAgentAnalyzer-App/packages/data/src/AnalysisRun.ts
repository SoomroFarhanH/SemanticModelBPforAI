import {
  date,
  entity,
  int,
  role,
  text,
  uuid,
} from '@microsoft/rayfin-core';

/**
 * One import of a Fabric Data Agent Analyzer JSON export: the headline score,
 * release gates, per-source scores and source inventory.
 *
 * The three `*Json` columns hold small, bounded arrays that are only ever
 * rendered whole, so they are stored as text rather than as separate entities.
 * Per-check results live in `Finding`.
 *
 * Rows are owner-scoped server side: a signed-in user only ever sees their own
 * runs. Widen the policy here if a team should share one history.
 */
@entity()
@role('authenticated', '*', {
  policy: (claims, item) => claims.sub.eq(item.owner_id),
})
export class AnalysisRun {
  @uuid() id!: string;
  @text({ min: 1, max: 200 }) agentName!: string;
  @text({ optional: true, max: 200 }) workspace?: string;
  @text({ optional: true, max: 100 }) stage?: string;
  @text({ optional: true, max: 100 }) runtime?: string;
  @text({ optional: true, max: 100 }) collectionMode?: string;
  @text({ max: 40 }) analyzerVersion!: string;
  @date() generatedAt!: Date;
  @date() importedAt!: Date;
  @int({ optional: true }) readinessPct?: number;
  @int({ optional: true }) coveragePct?: number;
  @text({ max: 100 }) rating!: string;
  @text({ optional: true, max: 500 }) ratingComment?: string;
  @int() passCount!: number;
  @int() warnCount!: number;
  @int() failCount!: number;
  @int() manualCount!: number;
  @int() unknownCount!: number;
  @text({ max: 4000 }) gatesJson!: string;
  @text({ max: 4000 }) scopesJson!: string;
  @text({ max: 4000 }) sourcesJson!: string;
  @text({ max: 200 }) owner_id!: string;
}
