//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import type {
  ConnectorConfig,
  ConnectorsRuntime,
} from '@microsoft/rayfin-connectors';
import type { FabricSemanticModel } from '@microsoft/rayfin-connector-fabric-semanticmodel';

/**
 * Connectors this app can talk to, keyed by the connector name declared in
 * `rayfin/rayfin.yml` under `connectors[].name`.
 *
 * The index signature keeps every name usable without editing this file each
 * time you run `rayfin connector add`. Narrow it to the names you actually use
 * if you want the compiler to catch a typo in a connection alias:
 *
 * @example
 * export type AppConnectorsSchema = {
 *   salesModel: FabricSemanticModel<'executeQuery'>;
 * };
 */
export type AppConnectorsSchema = Record<
  string,
  FabricSemanticModel<'executeQuery'>
>;

/**
 * Routing config for each connector, keyed by the same name again.
 *
 * `rayfin connector add` writes a `connectorConfig` constant into
 * `rayfin/connectors/<name>/schema.ts`. Re-export that constant here rather
 * than hand-writing the object, so this file cannot drift from `rayfin.yml`.
 *
 * @example
 * import { connectorConfig as salesModel } from '../../../../rayfin/connectors/salesModel/schema';
 *
 * export const connectorConfigs: Record<string, ConnectorConfig> = { salesModel };
 */
export const connectorConfigs: Record<string, ConnectorConfig> = {};

/**
 * Per-connector runtime hooks, keyed by the same name again.
 *
 * `fabric-semanticmodel` returns an Apache Arrow stream and chooses its
 * transport from where the app is running — embedded in the Fabric portal, or
 * standalone — and both of those live in the runtime. A connector left out of
 * this map falls back to the plain JSON pass-through and will not decode.
 * Register one runtime per semantic model; the connectors layer already keys
 * instances by name.
 *
 * @example
 * import { fabricSemanticModel } from '@microsoft/rayfin-connector-fabric-semanticmodel';
 *
 * export const connectorRuntimes: ConnectorsRuntime = {
 *   salesModel: fabricSemanticModel({}),
 * };
 *
 * @remarks
 * Do not pass a `target`. The workspace and item ids come from `rayfin.yml` and
 * are injected by the host, so they never ship to the browser. Deriving one from
 * a `VITE_*` variable throws at module load, because a per-model URL is not
 * among the variables `rayfin env` emits.
 */
export const connectorRuntimes: ConnectorsRuntime = {};

/**
 * Fails when a connector is configured without a matching runtime.
 *
 * A config with no runtime still sends the call, falls back to JSON
 * pass-through, and returns an Arrow stream nothing decodes — unreadable rows,
 * far from the missing line that caused them. Call this before constructing the
 * client to turn that into a startup error naming the connector.
 *
 * A runtime with no config is fine: it can be registered ahead of the
 * `connector add` that declares it.
 */
export function assertConnectorRuntimesRegistered(): void {
  const missing = Object.keys(connectorConfigs).filter(
    (name) => !(name in connectorRuntimes)
  );

  if (missing.length > 0) {
    throw new Error(
      `Connector(s) ${missing.map((n) => `"${n}"`).join(', ')} are in connectorConfigs but have no runtime in connectorRuntimes ` +
        `(packages/frontend/src/lib/connectors.ts). Without a runtime the response is not decoded and rows arrive unreadable. ` +
        `Add: ${missing.map((n) => `${n}: fabricSemanticModel({})`).join(', ')}.`
    );
  }
}
