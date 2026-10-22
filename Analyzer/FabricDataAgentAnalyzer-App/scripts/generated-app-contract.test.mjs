import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { seedDigest } from './scaffold.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function resolveTypeScriptCompiler() {
  try {
    return require.resolve('typescript/lib/tsc.js');
  } catch {
    const cliPackageJson =
      require.resolve('@microsoft/rayfin-cli/package.json');
    return createRequire(cliPackageJson).resolve('typescript/lib/tsc.js');
  }
}

test('the browser document title is Fabric App', () => {
  const html = readFileSync(
    resolve(root, 'packages', 'frontend', 'index.html'),
    'utf8'
  );
  assert.equal(html.match(/<title>([^<]*)<\/title>/u)?.[1], 'Fabric App');
});

test('client packs recognize every current pristine client variant', () => {
  const clients = [
    'packages/frontend/src/lib/rayfin-client.ts',
    '.agents/skills/connectors/kit/rayfin-client.ts',
    '.agents/skills/connectors/kit/rayfin-client.with-functions.ts',
    '.agents/skills/functions-capability/kit/rayfin-client.ts',
  ];
  for (const pack of ['connectors', 'functions-capability']) {
    const manifest = JSON.parse(
      readFileSync(
        resolve(root, '.agents', 'skills', pack, 'pack.json'),
        'utf8'
      )
    );
    const entry = manifest.copy.find(
      ({ to }) => to === 'packages/frontend/src/lib/rayfin-client.ts'
    );
    for (const client of clients) {
      assert.ok(
        entry.seedReplaceIfPristine.includes(
          seedDigest(readFileSync(resolve(root, client), 'utf8'))
        ),
        `${pack} must recognize the current ${client} before replacing it`
      );
    }
  }
});

test('React receives the resolved dynamic authentication service', () => {
  const main = readFileSync(
    resolve(root, 'packages', 'frontend', 'src', 'main.tsx'),
    'utf8'
  );
  const bootstrap = main.indexOf('await bootstrapAuth()');
  assert.ok(bootstrap >= 0 && bootstrap < main.indexOf('createRoot(document'));
  assert.match(main, /<Root rayfinAuthService=\{rayfinAuthService\} \/>/u);
  assert.doesNotMatch(main, /function Root\(/u);
});

test('the separate root protects the entire app with the dynamic auth provider and gate', () => {
  const rootSource = readFileSync(
    resolve(root, 'packages', 'frontend', 'src', 'Root.tsx'),
    'utf8'
  );
  let previous = -1;
  for (const fragment of [
    '<ThemeContext.Provider',
    '<ErrorBoundary',
    '<AuthProvider',
    '<AuthGate>',
    '<App />',
  ]) {
    const current = rootSource.indexOf(fragment);
    assert.ok(
      current > previous,
      `${fragment} must keep its provider position`
    );
    previous = current;
  }
});

test('hosted assets are protected while standalone authentication remains supported', () => {
  const config = readFileSync(resolve(root, 'rayfin', 'rayfin.yml'), 'utf8');
  assert.match(config, /assetAccess: protected/u);
  assert.match(config, /embedded:\s+only: false/u);
  assert.match(config, /auth:\s+enabled: true\s+fabric:\s+enabled: true/u);
  assert.match(config, /password:\s+enabled: false/u);
  assert.match(config, /externalEntraExchange: true/u);
});

test('frontend typechecks CLI-generated connector schemas', () => {
  const tsconfig = JSON.parse(
    readFileSync(resolve(root, 'packages', 'frontend', 'tsconfig.json'), 'utf8')
  );

  assert.equal(tsconfig.compilerOptions.rootDir, '../..');
  assert.ok(tsconfig.include.includes('../../rayfin/connectors/**/*.ts'));
});

test('rayfin compiler emits capability sources from one canonical config', () => {
  const tsconfig = JSON.parse(
    readFileSync(resolve(root, 'rayfin', 'tsconfig.json'), 'utf8')
  );

  assert.equal(tsconfig.extends, '../tsconfig.base.json');
  for (const [option, value] of Object.entries({
    outDir: '.temp/compiled',
    rootDir: '.',
    declaration: true,
    composite: true,
    noEmit: false,
    allowImportingTsExtensions: false,
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    tsBuildInfoFile: '.temp/rayfin.tsbuildinfo',
  })) {
    assert.equal(tsconfig.compilerOptions[option], value);
  }
  assert.deepEqual(tsconfig.include, ['**/*']);
  assert.deepEqual(tsconfig.exclude, ['.temp/**/*', 'functions/**/*']);
});

test('rayfin compiler emits loadable Category A connector JavaScript', async () => {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'rayfin-compiler-'));
  const connectorDir = resolve(
    fixtureRoot,
    'rayfin',
    'connectors',
    'compilerProbe'
  );
  const coreStubDir = resolve(
    fixtureRoot,
    'node_modules',
    '@microsoft',
    'rayfin-core'
  );

  try {
    mkdirSync(connectorDir, { recursive: true });
    mkdirSync(coreStubDir, { recursive: true });
    writeFileSync(
      resolve(fixtureRoot, 'package.json'),
      readFileSync(resolve(root, 'package.json'))
    );
    writeFileSync(
      resolve(fixtureRoot, 'tsconfig.base.json'),
      readFileSync(resolve(root, 'tsconfig.base.json'))
    );
    writeFileSync(
      resolve(fixtureRoot, 'rayfin', 'tsconfig.json'),
      readFileSync(resolve(root, 'rayfin', 'tsconfig.json'))
    );
    writeFileSync(
      resolve(coreStubDir, 'package.json'),
      JSON.stringify({
        name: '@microsoft/rayfin-core',
        version: '0.0.0',
        type: 'module',
        exports: {
          '.': {
            types: './index.d.ts',
            default: './index.js',
          },
        },
      })
    );
    writeFileSync(
      resolve(coreStubDir, 'index.d.ts'),
      [
        'export declare const entity: (...args: any[]) => any;',
        'export declare const text: (...args: any[]) => any;',
        'export declare const uuid: (...args: any[]) => any;',
        '',
      ].join('\n')
    );
    writeFileSync(
      resolve(coreStubDir, 'index.js'),
      [
        'export const entity = () => () => undefined;',
        'export const text = () => () => undefined;',
        'export const uuid = () => () => undefined;',
        '',
      ].join('\n')
    );
    writeFileSync(
      resolve(connectorDir, 'CompilerProbe.ts'),
      [
        "import { entity, text, uuid } from '@microsoft/rayfin-core';",
        '',
        '@entity()',
        'export class CompilerProbe {',
        '  @uuid() id!: string;',
        '  @text() name!: string;',
        '}',
        '',
      ].join('\n')
    );

    const result = spawnSync(
      process.execPath,
      [
        resolveTypeScriptCompiler(),
        '--build',
        'rayfin/tsconfig.json',
        '--force',
      ],
      {
        cwd: fixtureRoot,
        encoding: 'utf8',
      }
    );

    const compiledPath = resolve(
      fixtureRoot,
      'rayfin',
      '.temp',
      'compiled',
      'connectors',
      'compilerProbe',
      'CompilerProbe.js'
    );
    assert.equal(
      result.status,
      0,
      `Rayfin compiler failed:\n${result.stdout}${result.stderr}`
    );
    assert.ok(existsSync(compiledPath));

    const compiledModule = await import(pathToFileURL(compiledPath).href);
    assert.equal(typeof compiledModule.CompilerProbe, 'function');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
