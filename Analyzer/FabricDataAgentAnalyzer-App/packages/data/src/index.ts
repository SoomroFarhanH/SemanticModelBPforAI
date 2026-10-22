//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { AnalysisRun } from './AnalysisRun.js';
import { Finding } from './Finding.js';
import type { UniversalAppSchema } from '@rayfin-app/shared';

/**
 * The app's Rayfin data schema.
 *
 * `UniversalAppSchema` in `@rayfin-app/shared` is what makes
 * `(await getRayfinClient()).data.<Entity>` typed, so keep it in step with
 * `schema` below. Every entity needs explicit access control.
 */
export type { UniversalAppSchema };
export { AnalysisRun, Finding };

export const schema = [AnalysisRun, Finding];
