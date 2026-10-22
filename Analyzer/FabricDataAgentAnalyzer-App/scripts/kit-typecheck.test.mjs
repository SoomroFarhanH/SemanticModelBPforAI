//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

/**
 * Typechecks the TypeScript a pack copies into an app.
 *
 * Kit files live under `.agents/`, which `tsconfig.json` does not include, so
 * nothing compiles them until they are copied into the frontend workspace. That gap
 * shipped a kit file that could not compile: a fixture annotated with a type it
 * only satisfies through a variable, which excess-property checking rejects on
 * a fresh object literal. Every test passed, because none of them ran `tsc`.
 *
 * The external packages are stubbed rather than installed. The bug class this
 * catches is inside our own files, and stubbing keeps the test offline and
 * quick; a real install is what `rayfin_validate_app` does on a generated app.
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const TEMPLATE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const workspaces = [];

after(async () => {
  for (const dir of workspaces) {
    await rm(dir, { recursive: true, force: true });
  }
});

/** Where a TypeScript we can run lives, or undefined. */
const TYPESCRIPT = (() => {
  const require = createRequire(import.meta.url);
  for (const candidate of ['typescript-compiler', 'typescript']) {
    try {
      return path.dirname(require.resolve(`${candidate}/package.json`));
    } catch {
      // Try the next one.
    }
  }
  return undefined;
})();

/**
 * `typescript` is a declared devDependency. If it is declared and still
 * unresolvable the install is broken, and skipping would report a green run that
 * checked nothing. Only a checkout that does not declare it may skip.
 */
const TYPESCRIPT_IS_DECLARED = (() => {
  const require = createRequire(import.meta.url);
  try {
    const pkg = require('../package.json');
    return Boolean(
      pkg.devDependencies?.typescript ??
      pkg.dependencies?.typescript ??
      pkg.devDependencies?.['typescript-compiler']
    );
  } catch {
    return false;
  }
})();

const needsTypeScript = {
  skip:
    TYPESCRIPT === undefined && !TYPESCRIPT_IS_DECLARED
      ? 'TypeScript is not installed here'
      : false,
};

/** Minimal declarations for what the kit imports but does not own. */
const STUBS = {
  'types/rayfin-client.d.ts': `declare module '@microsoft/rayfin-client' {
  export interface RayfinClientConfig {
    baseUrl: string;
    publishableKey: string;
    authStorage?: boolean;
    runtimeConfig?: unknown;
    functionsBaseUrl?: string;
  }
  export class RayfinClient<TSchema = Record<string, never>, TFunctions = Record<string, never>> {
    constructor(config: RayfinClientConfig);
  }
  export class ConnectorsRayfinClient<
    TSchema = Record<string, never>,
    TFunctions = Record<string, never>,
    TConnectorsSchema extends Record<string, unknown> = Record<string, unknown>
  > extends RayfinClient<TSchema, TFunctions> {
    readonly connectors: import('@microsoft/rayfin-connectors').TypedConnectorsApi<TConnectorsSchema>;
    constructor(
      config: RayfinClientConfig & {
        connectors: Record<keyof TConnectorsSchema & string, unknown>;
      },
      connectorRuntimes?: Record<string, unknown>
    );
  }
  export function resolveRayfinConfig(config: {
    apiUrl?: string;
    publishableKey?: string;
    workspaceId?: string;
    itemId?: string;
    portalUrl?: string;
  }): Promise<{ baseUrl?: string; publishableKey?: string; runtimeConfig?: unknown }>;
}
`,
  'types/rayfin-app.d.ts': `declare module '@rayfin-app/shared' {
  export type UniversalAppSchema = Record<string, never>;
}
declare module '@rayfin-app/functions/types' {
  export type AppFunctionsSchema = Record<string, never>;
}
`,
  'types/vite-env.d.ts': `interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly VITE_RAYFIN_API_URL?: string;
  readonly VITE_RAYFIN_PUBLISHABLE_KEY?: string;
  readonly VITE_FABRIC_WORKSPACE_ID?: string;
  readonly VITE_FABRIC_ITEM_ID?: string;
  readonly VITE_FABRIC_PORTAL_URL?: string;
  readonly VITE_RAYFIN_FUNCTIONS_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
`,
  'rayfin/data/schema.ts': `export type UniversalAppSchema = Record<string, never>;
`,
  'rayfin/functions/src/types.ts': `export type AppFunctionsSchema = Record<string, never>;
`,
  'types/fabric-visuals-core.d.ts': `declare module '@microsoft/fabric-visuals-core' {
  export interface ColumnDef {
    name: string;
    displayName?: string;
    format?: string;
    semanticType?: string;
  }
  export interface DataTable {
    columns: ColumnDef[];
    rows: unknown[][];
  }
}
`,
  // The connectors client and the semantic model connector, mirrored from the
  // installed packages at `1.35.0-alpha.1412`.
  //
  // A hand-written mirror can drift from a future release. The authoritative
  // check is the generated app's own `npm run typecheck`; this catches our
  // errors before the kit is copied.
  'types/rayfin-connectors.d.ts': `declare module '@microsoft/rayfin-connectors' {
  export interface OperationDef<TInput = unknown, TOutput = unknown> {
    readonly __input?: TInput;
    readonly __output?: TOutput;
  }
  export type OperationCatalog = Record<string, OperationDef<any, any>>;
  export interface ConnectorMarker<TCatalog extends OperationCatalog> {
    readonly __operations?: TCatalog;
  }
  export type ConnectorsSchema = Record<string, ConnectorMarker<any>>;
  export type ConnectorConfig = Record<string, unknown>;
  export type ConnectorsRuntime = Record<string, unknown>;
  export type TypedConnectorsApi<TSchema> = { [K in keyof TSchema]: unknown };
  export function createConnectorsApi<TSchema>(
    client: unknown,
    configs: Record<keyof TSchema & string, ConnectorConfig>,
    runtime?: ConnectorsRuntime
  ): TypedConnectorsApi<TSchema>;
}
declare module '@microsoft/rayfin-connector-fabric-semanticmodel' {
  import type { ConnectorMarker, OperationDef } from '@microsoft/rayfin-connectors';
  export interface ExecuteQueryInput {
    query: string;
  }
  export interface FabricSemanticModelError {
    code?: string;
    message: string;
  }
  export interface FabricSemanticModelTable {
    rows: Array<Record<string, unknown>>;
    error?: FabricSemanticModelError;
    columns?: Array<{ name: string; dataType?: string }>;
  }
  export interface FabricSemanticModelOutput {
    tables: FabricSemanticModelTable[];
    requestId?: string;
    queryError?: FabricSemanticModelError | null;
    responseError?: FabricSemanticModelError | null;
  }
  export interface FabricSemanticModelTabularResponse {
    status: string;
    output: FabricSemanticModelOutput;
    errors: unknown[];
  }
  export type FabricSemanticModelOperation = 'executeQuery';
  export interface FabricSemanticModelOperationCatalog {
    executeQuery: OperationDef<ExecuteQueryInput, FabricSemanticModelTabularResponse>;
  }
  export type FabricSemanticModel<
    TOps extends FabricSemanticModelOperation = FabricSemanticModelOperation
  > = ConnectorMarker<Pick<FabricSemanticModelOperationCatalog, TOps>>;
  export interface QueryColumn {
    name: string;
    dataType: string;
  }
  export interface QueryTable {
    columns: QueryColumn[];
    rows: unknown[][];
  }
  export type QueryErrorCategory =
    | 'api'
    | 'query'
    | 'network'
    | 'overflow'
    | 'unknown';
  export interface QueryError {
    category: QueryErrorCategory;
    message: string;
    code?: string;
    details?: string;
    recoveryHint?: string;
  }
  export type SemanticModelQueryResult =
    | { status: 'success'; table: QueryTable; requestId: string }
    | { status: 'error'; error: QueryError; requestId: string };
  export function toQueryResult(
    response: FabricSemanticModelTabularResponse
  ): SemanticModelQueryResult;
}
// The connectors pack installs the composable client that the analytics hook
// requires; the base template client has no "connectors" member.
//
// This checks the kit, not pack application or generated connector wiring.
declare module '@/lib/rayfin-client' {
  export function getRayfinClient(): Promise<{ connectors: unknown }>;
}
`,
  // Only what the kit's hooks call. React itself is not what this test is about.
  'types/react.d.ts': `declare module 'react' {
  export function useState<T = undefined>(): [
    T | undefined,
    (next: T | undefined | ((previous: T | undefined) => T | undefined)) => void
  ];
  export function useState<T>(initial: T | (() => T)): [T, (next: T | ((previous: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useCallback<T>(callback: T, deps: readonly unknown[]): T;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useRef<T>(initial: T): { current: T };
}
`,
  // `import.meta.env`, which a kit file may read for a build-time flag. A
  // generated app gets this from `vite/client`; this harness compiles offline,
  // so it states the same shape directly.
  //
  // The index signature is the load-bearing part - `vite/client` declares one,
  // which is why an app can read any `VITE_*` name.
  'types/import-meta-env.d.ts': `interface ImportMetaEnv {
  readonly [key: string]: string | boolean | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
`,
};

const TSCONFIG = {
  compilerOptions: {
    target: 'ES2022',
    lib: ['ES2022', 'DOM'],
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    isolatedModules: true,
    moduleDetection: 'force',
    paths: { '@/*': ['./packages/frontend/src/*'] },
  },
  include: ['packages/frontend/src', 'types'],
};

/** Copies one pack's TypeScript kit into a throwaway app and compiles it. */
async function typecheckKit(pack, sourceOverrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), `kit-typecheck-${pack}-`));
  workspaces.push(root);
  await mkdir(path.join(root, 'packages', 'frontend', 'src'), {
    recursive: true,
  });

  // Driven by the pack's own `copy` entries rather than a fixed `kit/lib`, so a
  // pack that starts copying another directory is compiled without this test
  // being updated to match. Frontend source only: a script or a connector file is
  // not TypeScript the app builds.
  const manifest = JSON.parse(
    await readFile(
      path.join(TEMPLATE, '.agents', 'skills', pack, 'pack.json'),
      'utf8'
    )
  );
  const sources = (manifest.copy ?? []).filter(
    (entry) =>
      typeof entry.to === 'string' &&
      entry.to.startsWith('packages/frontend/src/')
  );
  assert.ok(
    sources.length > 0,
    `${pack}/pack.json copies nothing into packages/frontend/src/, so this test would compile nothing`
  );
  for (const entry of sources) {
    const source = sourceOverrides[entry.to] ?? entry.from;
    await cp(
      path.join(TEMPLATE, '.agents', 'skills', pack, source),
      path.join(root, ...entry.to.split('/')),
      {
        recursive: true,
        // `.spec` files are excluded rather than stubbed. They import a test
        // runner and a DOM testing library, and hand-writing a matcher surface
        // would assert an API this test does not verify - a generated app
        // installs both for real and compiles them on `npm run typecheck`.
        filter: (source) => !/\.(?:spec|test)\.[jt]sx?$/u.test(source),
      }
    );
  }

  for (const [relative, contents] of Object.entries(STUBS)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents, 'utf8');
  }
  await writeFile(
    path.join(root, 'tsconfig.json'),
    JSON.stringify(TSCONFIG, null, 2),
    'utf8'
  );

  if (TYPESCRIPT === undefined) {
    throw new Error(
      'typescript is a declared dependency of this app but could not be ' +
        'resolved, so the kit was never compiled. Run `npm install` in ' +
        'samples/universal-app. This is a broken install, not a type error.'
    );
  }

  try {
    await run(
      process.execPath,
      [path.join(TYPESCRIPT, 'bin', 'tsc'), '--project', root],
      { encoding: 'utf8' }
    );
    return '';
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
}

test(
  'the visuals kit compiles once copied into an app',
  needsTypeScript,
  async () => {
    const output = await typecheckKit('visuals');
    assert.equal(output, '', `visuals kit does not typecheck:\n${output}`);
  }
);

test(
  'the analytics kit compiles once copied into an app',
  needsTypeScript,
  async () => {
    // Analytics ships the semantic-model hook and the connector registration.
    // The connector packages are stubbed, so what is actually asserted is that
    // our own files hold together against them.
    const output = await typecheckKit('analytics');
    assert.equal(output, '', `analytics kit does not typecheck:\n${output}`);
  }
);

const PACKS_WITH_APP_SOURCES = await (async () => {
  const skills = path.join(TEMPLATE, '.agents', 'skills');
  const directories = await readdir(skills);
  const packs = [];
  for (const directory of directories) {
    try {
      const manifest = JSON.parse(
        await readFile(path.join(skills, directory, 'pack.json'), 'utf8')
      );
      if (
        (manifest.copy ?? []).some(
          (entry) =>
            typeof entry.to === 'string' &&
            entry.to.startsWith('packages/frontend/src/')
        )
      ) {
        packs.push(directory);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return packs.sort();
})();

for (const pack of PACKS_WITH_APP_SOURCES) {
  test(`${pack} app-source kit compiles`, needsTypeScript, async () => {
    const output = await typecheckKit(pack);
    assert.equal(output, '', `${pack} kit does not typecheck:\n${output}`);
  });
}

test(
  'the connector client kits compile once copied into an app',
  needsTypeScript,
  async () => {
    const connectorsOnly = await typecheckKit('connectors');
    assert.equal(
      connectorsOnly,
      '',
      `connector client kit does not typecheck:\n${connectorsOnly}`
    );

    const withFunctions = await typecheckKit('connectors', {
      'packages/frontend/src/lib/rayfin-client.ts':
        'kit/rayfin-client.with-functions.ts',
    });
    assert.equal(
      withFunctions,
      '',
      `composed connector-functions client kit does not typecheck:\n${withFunctions}`
    );
  }
);
