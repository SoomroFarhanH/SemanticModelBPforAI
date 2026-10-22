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

/** Replaced with named connector types by `rayfin connector add`. */
export type AppConnectorsSchema = Record<string, never>;

export const connectorConfigs: Record<string, ConnectorConfig> = {};

export const connectorRuntimes: ConnectorsRuntime = {};
