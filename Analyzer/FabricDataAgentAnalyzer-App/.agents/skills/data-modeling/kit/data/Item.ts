//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import {
  boolean,
  date,
  entity,
  role,
  text,
  uuid,
} from '@microsoft/rayfin-core';

/**
 * A starter entity — rename it, change the fields, keep the shape.
 *
 * The two parts worth keeping are the `@role` policy and `owner_id`. Together
 * they mean a signed-in user only ever sees their own rows, enforced server
 * side rather than by a filter in the UI. Drop them and every user reads every
 * row.
 *
 * `owner_id` is not filled in for you: set it to the signed-in user's id when
 * you create a record. The policy refuses any value that is not the caller's
 * own, so it cannot be forged. If a record should instead be readable by the
 * whole team, widen the policy here rather than removing it — an entity with no
 * access control is refused at validation time.
 *
 * Every `@text` carries an explicit `max`. Without one MSSQL gets
 * `NVARCHAR(MAX)`, and the metadata provider can then fail to build a GraphQL
 * schema — an "Internal server error" at runtime after a deploy that reported
 * success. Keep a bound on any string field you add.
 */
@entity()
@role('authenticated', '*', {
  policy: (claims, item) => claims.sub.eq(item.owner_id),
})
export class Item {
  @uuid() id!: string;
  @text({ min: 1, max: 200 }) title!: string;
  @text({ optional: true, max: 2000 }) notes?: string;
  @boolean({ default: false }) done!: boolean;
  @date() createdAt!: Date;
  @text({ max: 200 }) owner_id!: string;
}
