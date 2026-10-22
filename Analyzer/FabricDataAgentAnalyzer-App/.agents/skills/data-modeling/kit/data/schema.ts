//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { Item } from './Item.js';
import type { UniversalAppSchema } from '@rayfin-app/shared';

/**
 * The app's Rayfin data schema.
 *
 * `UniversalAppSchema` in `@rayfin-app/shared` is what makes
 * `(await getRayfinClient()).data.<Entity>` typed, so keep it in step with `schema`
 * below: a class registered in `schema` but missing from the shared type is
 * reachable at runtime and invisible to the compiler.
 *
 * To add an entity: declare it as a decorated class next to `Item.ts`, export it
 * here, add its record contract to `@rayfin-app/shared`, and register it in the
 * array. Every entity needs explicit access control — anonymous access is
 * refused at validation time. See the `data-modeling` skill.
 */
export type { UniversalAppSchema };
export { Item };

export const schema = [Item];
