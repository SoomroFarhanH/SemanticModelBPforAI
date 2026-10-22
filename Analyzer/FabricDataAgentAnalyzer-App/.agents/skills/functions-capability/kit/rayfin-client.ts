//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { RayfinClient, resolveRayfinConfig } from '@microsoft/rayfin-client';
import type { AppFunctionsSchema } from '@rayfin-app/functions/types';
import type { UniversalAppSchema } from '@rayfin-app/shared';

let _client:
  | Promise<RayfinClient<UniversalAppSchema, AppFunctionsSchema>>
  | undefined;

export class MissingRayfinConfigError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(`Missing required Rayfin configuration: ${missing.join(', ')}`);
    this.name = 'MissingRayfinConfigError';
  }
}

/**
 * Resolves and shares the app's configured Rayfin client.
 *
 * Typed by `UniversalAppSchema` and `AppFunctionsSchema`, so `client.data.<Entity>`
 * and `client.functions.<Function>` are both checked against what the app
 * declares. Without the generics those APIs are `any`, and a typo in an entity,
 * field or function name only surfaces at runtime — which the app's
 * `tsc --noCheck` build would never catch.
 *
 * Async because deployment-specific values are resolved at runtime rather than
 * compiled in: a Deployment Pipeline promotes one built artifact from Dev to
 * Prod, so a bundle carrying build-time `VITE_*` values would point the
 * promoted app at the previous stage's backend. The `VITE_*` values are still
 * passed as defaults, which is what local dev runs on.
 */
export async function getRayfinClient(): Promise<
  RayfinClient<UniversalAppSchema, AppFunctionsSchema>
> {
  if (!_client) {
    _client = createClient().catch((error) => {
      _client = undefined;
      throw error;
    });
  }

  return _client;
}

async function createClient(): Promise<
  RayfinClient<UniversalAppSchema, AppFunctionsSchema>
> {
  const resolved = await resolveRayfinConfig({
    apiUrl: import.meta.env.VITE_RAYFIN_API_URL,
    publishableKey: import.meta.env.VITE_RAYFIN_PUBLISHABLE_KEY,
    workspaceId: import.meta.env.VITE_FABRIC_WORKSPACE_ID,
    itemId: import.meta.env.VITE_FABRIC_ITEM_ID,
    portalUrl: import.meta.env.VITE_FABRIC_PORTAL_URL,
  });

  if (!resolved.baseUrl || !resolved.publishableKey) {
    throw new MissingRayfinConfigError([
      ...(!resolved.baseUrl ? ['apiUrl'] : []),
      ...(!resolved.publishableKey ? ['publishableKey'] : []),
    ]);
  }

  return new RayfinClient<UniversalAppSchema, AppFunctionsSchema>({
    baseUrl: resolved.baseUrl,
    publishableKey: resolved.publishableKey,
    authStorage: true,
    runtimeConfig: resolved.runtimeConfig,
  });
}
