import {
  entity,
  one,
  role,
  text,
  uuid,
} from '@microsoft/rayfin-core';

import { AnalysisRun } from './AnalysisRun.js';

/**
 * One analyzer check result (a row of the export's `findings[]`) belonging to
 * an `AnalysisRun`. `owner_id` repeats the run owner so the same server-side
 * owner policy applies to every row.
 */
@entity()
@role('authenticated', '*', {
  policy: (claims, item) => claims.sub.eq(item.owner_id),
})
export class Finding {
  @uuid() id!: string;
  @uuid() run_id!: string;
  @one(() => AnalysisRun, { optional: true }) run?: AnalysisRun;
  @text({ max: 40 }) ruleId!: string;
  @text({ optional: true, max: 200 }) sourceName?: string;
  @text({ optional: true, max: 400 }) objectPath?: string;
  @text({ max: 20 }) status!: string;
  @text({ max: 20 }) severity!: string;
  @text({ max: 300 }) title!: string;
  @text({ optional: true, max: 1500 }) evidence?: string;
  @text({ optional: true, max: 1500 }) recommendation?: string;
  @text({ optional: true, max: 500 }) docsUrl?: string;
  @text({ optional: true, max: 40 }) automation?: string;
  @text({ max: 200 }) owner_id!: string;
}
