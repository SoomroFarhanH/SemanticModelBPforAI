// scripts/scaffold.integration.test.mjs — applies real capability packs to a
// throwaway copy of this template and asserts what survives a second run.
//
// The unit tests exercise `classifySeed`, which the ordinary directory-copy path
// never calls. That gap let a blocker through: re-applying a pack overwrote the
// semantic model connection that had just been configured. These tests drive the
// real script end to end so that cannot come back.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import {
  basename,
  delimiter,
  dirname,
  join,
  relative,
  resolve,
} from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  clearPackInstall,
  depsFingerprint,
  shouldInstallPackDependencies,
} from './scaffold.mjs';

const TEMPLATE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const workspaces = [];
const tempRoot =
  process.platform === 'win32' && process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'Temp')
    : os.tmpdir();

function resolvePackageRoot(name) {
  try {
    return dirname(require.resolve(`${name}/package.json`));
  } catch {
    return undefined;
  }
}

const validatorTooling = {
  yaml: resolvePackageRoot('yaml'),
  typescript:
    resolvePackageRoot('typescript-compiler') ??
    resolvePackageRoot('typescript'),
};
const needsValidatorTooling = {
  skip: Object.values(validatorTooling).some((source) => source === undefined)
    ? 'yaml and TypeScript are required to execute validator upgrade fixtures'
    : false,
};

function runNpm(args, options) {
  return execFileSync('npm', args, {
    ...options,
    shell: process.platform === 'win32',
  });
}

after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway copy of the template, minus anything heavy or generated. */
function makeApp() {
  const dir = realpathSync(mkdtempSync(join(tempRoot, 'pack-integration-')));
  workspaces.push(dir);
  cpSync(TEMPLATE, dir, {
    recursive: true,
    filter: (src) =>
      !/[\\/](node_modules|dist|\.git|\.rayfin)([\\/]|$)/u.test(src) &&
      !/[\\/]\.tsbuildinfo$/u.test(src),
  });
  return dir;
}

/** Applies a pack without touching the network. */
function applyPack(dir, extra = [], pack = 'analytics') {
  return execFileSync(
    process.execPath,
    [join(dir, 'scripts', 'scaffold.mjs'), pack, '--no-install', ...extra],
    { cwd: dir, encoding: 'utf8' }
  );
}

function linkValidatorTooling(dir) {
  const nodeModules = join(dir, 'node_modules');
  mkdirSync(nodeModules, { recursive: true });
  for (const [name, source] of Object.entries(validatorTooling)) {
    symlinkSync(source, join(nodeModules, name), 'junction');
  }
}

function runVisualValidator(dir, extra = []) {
  const result = spawnSync(
    process.execPath,
    [join(dir, 'scripts', 'validate-visual.mjs'), '--root', dir, ...extra],
    { cwd: dir, encoding: 'utf8' }
  );
  return {
    exitCode: result.status ?? 1,
    report: JSON.parse(result.stdout || '{}'),
  };
}

function snapshotApp(root, directory = root, snapshot = new Map()) {
  for (const name of readdirSync(directory).sort()) {
    if (name === 'node_modules') continue;
    const path = join(directory, name);
    const key = path.slice(root.length + 1);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      snapshot.set(key, { link: readlinkSync(path) });
    } else if (stat.isDirectory()) {
      snapshot.set(key, 'directory');
      snapshotApp(root, path, snapshot);
    } else {
      snapshot.set(key, { bytes: readFileSync(path), mode: stat.mode });
    }
  }
  return snapshot;
}

function assertAppUnchanged(dir, before) {
  const after = snapshotApp(dir);
  assert.deepEqual([...after.keys()], [...before.keys()], 'app paths changed');
  for (const [path, state] of before) {
    assert.deepEqual(after.get(path), state, `${path} changed`);
  }
}

/** Exercises the real process boundary without a network or npm cache. */
function fakeInstaller() {
  const bin = mkdtempSync(join(os.tmpdir(), 'rayfin-fakenpm-'));
  workspaces.push(bin);
  const script = join(bin, 'install.cjs');
  const calls = join(bin, 'calls.txt');
  const command = `"${process.execPath}" "${script}"`;
  writeFileSync(join(bin, 'npm.cmd'), `@echo off\r\n${command} %*\r\n`);
  writeFileSync(join(bin, 'npm'), `#!/bin/sh\nexec ${command} "$@"\n`, {
    mode: 0o755,
  });
  return {
    setBehavior(body) {
      writeFileSync(
        script,
        `const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
assert.deepEqual(process.argv.slice(2), ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
fs.appendFileSync(${JSON.stringify(calls)}, process.cwd() + '\\n');
${body}\n`
      );
    },
    calls() {
      return existsSync(calls)
        ? readFileSync(calls, 'utf8').trim().split('\n')
        : [];
    },
    run(dir, pack = 'visuals', flags = []) {
      const result = spawnSync(
        process.execPath,
        [join(dir, 'scripts', 'scaffold.mjs'), pack, ...flags],
        {
          cwd: dir,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${bin}${delimiter}${process.env.PATH}`,
            Path: `${bin}${delimiter}${process.env.PATH}`,
          },
        }
      );
      assert.ifError(result.error);
      return result;
    },
  };
}

for (const pack of ['visuals', 'functions']) {
  test(`${pack} rolls back failed installs, then retries and reapplies idempotently`, () => {
    const dir = makeApp();
    const installer = fakeInstaller();
    installer.setBehavior('process.exit(0);');
    assert.equal(installer.run(dir, 'analytics').status, 0);
    const priorMarker = join(
      dir,
      'node_modules',
      '.rayfin-packs',
      'analytics.json'
    );
    const priorInstall = readFileSync(priorMarker);
    const marker = join(dir, 'node_modules', '.rayfin-packs', `${pack}.json`);
    const pkgPath = join(dir, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    pkg.scripts['authored:check'] = 'node scripts/authored-check.mjs';
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 4).replace(/\n/g, '\r\n'));
    appendFileSync(
      join(dir, 'packages', 'frontend', 'src', 'App.tsx'),
      '\n// Keep authored application changes.\n'
    );
    writeFileSync(join(dir, 'package-lock.json'), '{"lockfileVersion":3}\r\n');
    mkdirSync(join(dir, 'scripts', 'authored-empty'));
    const stamp = join(dir, 'packages', 'frontend', '.tsbuildinfo');
    writeFileSync(stamp, '{"baseline":true}\r\n');
    const stampModified = lstatSync(stamp).mtimeMs;
    const before = snapshotApp(dir);

    installer.setBehavior(`
const root = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.ok(root.rayfinPacks.includes(${JSON.stringify(pack)}));
assert.equal(fs.existsSync(${JSON.stringify(stamp)}), false);
console.error('npm error code ENOTCACHED');
process.exit(1);`);

    const dryRun = installer.run(dir, pack, ['--dry-run']);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assertAppUnchanged(dir, before);
    assert.ok(
      Math.abs(lstatSync(stamp).mtimeMs - stampModified) < 1,
      'dry-run preserves the original build-stamp timestamp'
    );
    assert.equal(installer.calls().length, 1, 'dry-run must not invoke npm');
    assert.equal(existsSync(marker), false);

    for (let attempt = 0; attempt < 2; attempt++) {
      const failed = installer.run(dir, pack);
      assert.equal(failed.status, 1);
      assert.match(failed.stderr, /npm error code ENOTCACHED/u);
      assert.match(failed.stderr, /dependency install failed/u);
      assert.doesNotMatch(failed.stdout, /Pack ready/u);
      assert.doesNotMatch(failed.stderr, /rollback kept/u);
      assertAppUnchanged(dir, before);
      assert.ok(
        Math.abs(lstatSync(stamp).mtimeMs - stampModified) < 1,
        'rollback restores the original build-stamp timestamp'
      );
      assert.equal(existsSync(marker), false);
      assert.deepEqual(readFileSync(priorMarker), priorInstall);
    }
    assert.equal(installer.calls().length, 3, 'both failed attempts ran npm');

    installer.setBehavior('process.exit(0);');
    const retried = installer.run(dir, pack);
    assert.equal(retried.status, 0, retried.stderr);
    assert.match(retried.stdout, /Pack ready/u);
    assert.equal(
      existsSync(stamp),
      false,
      'a successful apply clears the stamp'
    );
    assert.equal(existsSync(marker), true);
    assert.deepEqual(
      JSON.parse(readFileSync(pkgPath, 'utf8')).rayfinPacks,
      ['analytics', pack].sort()
    );
    const installed = snapshotApp(dir);
    const reapplied = installer.run(dir, pack);
    assert.equal(reapplied.status, 0, reapplied.stderr);
    assert.match(reapplied.stdout, /already installed - skipping install/u);
    assertAppUnchanged(dir, installed);
    assert.equal(installer.calls().length, 4, 'reapply must not reinstall');
  });
}

test('rollback preserves force-replaced authored seeds, settings and scripts', () => {
  const dir = makeApp();
  applyPack(dir, [], 'functions');
  const client = join(
    dir,
    'packages',
    'frontend',
    'src',
    'lib',
    'rayfin-client.ts'
  );
  writeFileSync(client, '\uFEFF// Authored client.\r\n');
  const pkgPath = join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.scripts.build = 'authored build';
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  const ymlPath = join(dir, 'rayfin', 'rayfin.yml');
  writeFileSync(
    ymlPath,
    readFileSync(ymlPath, 'utf8').replace(
      'path: "packages/functions"',
      'path: "packages/authored-functions"'
    )
  );
  const before = snapshotApp(dir);
  const installer = fakeInstaller();
  installer.setBehavior(
    'console.error("forced install failure"); process.exit(23);'
  );
  const dryRun = installer.run(dir, 'functions', [
    '--force-seeds',
    '--dry-run',
  ]);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assertAppUnchanged(dir, before);
  assert.equal(installer.calls().length, 0);
  const failed = installer.run(dir, 'functions', ['--force-seeds']);
  assert.equal(failed.status, 23, failed.stderr);
  assert.match(failed.stderr, /forced install failure/u);
  assert.doesNotMatch(failed.stderr, /rollback kept/u);
  assertAppUnchanged(dir, before);
});

test('a legacy install failure rolls back the pack after the root install succeeds', () => {
  const dir = makeApp();
  const packPath = join(
    dir,
    '.agents',
    'skills',
    'functions-capability',
    'pack.json'
  );
  const pack = JSON.parse(readFileSync(packPath, 'utf8'));
  pack.installDirectories = ['packages/functions'];
  writeFileSync(packPath, JSON.stringify(pack));
  const before = snapshotApp(dir);
  const marker = join(dir, 'node_modules', '.rayfin-packs', 'functions.json');
  const installer = fakeInstaller();
  installer.setBehavior(`
assert.equal(fs.existsSync(${JSON.stringify(marker)}), false, 'no success before all installs finish');
if (process.cwd() === ${JSON.stringify(dir)}) process.exit(0);
console.error('nested install failed');
process.exit(19);`);
  const failed = installer.run(dir, 'functions');
  assert.equal(failed.status, 19, failed.stderr);
  assert.match(failed.stderr, /nested install failed/u);
  assert.match(
    failed.stderr,
    /dependency install failed in packages\/functions/u
  );
  assert.doesNotMatch(failed.stdout, /Pack ready/u);
  assert.doesNotMatch(failed.stderr, /rollback kept/u);
  assert.equal(installer.calls().length, 2);
  assert.equal(existsSync(marker), false);
  assertAppUnchanged(dir, before);
});

test('rollback preserves external edits and installer-owned state with recovery diagnostics', () => {
  const dir = makeApp();
  const before = snapshotApp(dir);
  const stamp = join(dir, 'packages', 'frontend', '.tsbuildinfo');
  writeFileSync(stamp, '{"baseline":true}');
  const installer = fakeInstaller();
  installer.setBehavior(`
fs.writeFileSync('package.json', '{"name":"externally-edited"}\\n');
fs.writeFileSync('packages/functions/src/function_app.ts', '// External function.\\n');
fs.writeFileSync('packages/functions/src/authored.txt', 'keep');
fs.writeFileSync(${JSON.stringify(stamp)}, '{"externalBuild":true}');
fs.writeFileSync('package-lock.json', '{"installerLock":true}');
fs.mkdirSync('node_modules', { recursive: true });
fs.writeFileSync('node_modules/installer-state.txt', 'partial install');
console.error('npm error code ENOTCACHED');
process.exit(1);`);
  const failed = installer.run(dir, 'functions');
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /npm error code ENOTCACHED/u);
  assert.match(failed.stderr, /rollback.*package\.json/iu);
  assert.match(failed.stderr, /rollback.*function_app\.ts/iu);
  assert.match(failed.stderr, /rollback.*\.tsbuildinfo/iu);
  assert.match(failed.stderr, /node_modules/u);
  assert.match(failed.stderr, /lockfiles/u);
  assert.match(
    failed.stderr,
    /npm install --ignore-scripts --no-audit --no-fund/u
  );
  assert.doesNotMatch(failed.stdout, /Pack ready/u);
  for (const [path, text] of [
    ['package.json', '{"name":"externally-edited"}\n'],
    ['packages/functions/src/function_app.ts', '// External function.\n'],
    ['packages/functions/src/authored.txt', 'keep'],
    ['packages/frontend/.tsbuildinfo', '{"externalBuild":true}'],
    ['package-lock.json', '{"installerLock":true}'],
    ['node_modules/installer-state.txt', 'partial install'],
  ]) {
    assert.equal(readFileSync(join(dir, path), 'utf8'), text);
  }
  for (const path of [
    join('rayfin', 'rayfin.yml'),
    join('packages', 'frontend', 'package.json'),
    join('packages', 'frontend', 'src', 'lib', 'rayfin-client.ts'),
  ]) {
    assert.deepEqual(readFileSync(join(dir, path)), before.get(path).bytes);
  }
  assert.equal(
    existsSync(join(dir, 'packages', 'functions', 'package.json')),
    false
  );
});

test('rollback does not follow a directory replaced by a junction during install', () => {
  const dir = makeApp();
  const authored = join(dir, 'authored');
  mkdirSync(authored);
  const authoredFile = join(authored, 'function_app.ts');
  writeFileSync(authoredFile, '// Do not overwrite this file.\n');
  const installer = fakeInstaller();
  installer.setBehavior(`
const source = path.resolve('packages/functions/src');
fs.renameSync(source, path.resolve('packages/functions/relocated-src'));
fs.symlinkSync(${JSON.stringify(authored)}, source, 'junction');
console.error('npm error code ENOTCACHED');
process.exit(1);`);
  const failed = installer.run(dir, 'functions');
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /rollback kept packages\/functions\/src/u);
  assert.equal(
    readFileSync(authoredFile, 'utf8'),
    '// Do not overwrite this file.\n'
  );
  assert.ok(
    lstatSync(join(dir, 'packages', 'functions', 'src')).isSymbolicLink()
  );
  assert.ok(
    existsSync(
      join(dir, 'packages', 'functions', 'relocated-src', 'function_app.ts')
    )
  );
  assert.equal(
    JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).rayfinPacks,
    undefined
  );
});

test('a copy failure rolls back earlier mutations even with --no-install', () => {
  const dir = makeApp();
  mkdirSync(join(dir, 'scripts', 'validate-visual.mjs'));
  const before = snapshotApp(dir);
  const installer = fakeInstaller();
  installer.setBehavior('throw new Error("npm must not run");');
  const failed = installer.run(dir, 'visuals', ['--no-install']);
  assert.equal(failed.status, 1);
  assert.doesNotMatch(failed.stdout, /Pack ready/u);
  assert.doesNotMatch(failed.stderr, /rollback kept/u);
  assert.equal(installer.calls().length, 0);
  assertAppUnchanged(dir, before);
});

test('functions retains composable workspace script stages', () => {
  // `functions` is the pack that exercises staged script rewriting, now that the
  // semantic model is reached through a connector reading `rayfin.yml`.
  const pack = JSON.parse(
    readFileSync(
      join(TEMPLATE, '.agents', 'skills', 'functions-capability', 'pack.json'),
      'utf8'
    )
  );

  const stages = pack.scriptStages ?? {};
  assert.ok(
    Object.keys(stages).length > 0,
    'functions must still declare staged scripts'
  );

  // A stage is prepended to the app's own script, so the proof is in the applied
  // app rather than in the manifest.
  const dir = makeApp();
  applyPack(dir, [], 'functions');
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

  for (const [name, commands] of Object.entries(stages)) {
    assert.ok(Array.isArray(commands) && commands.length > 0);
    for (const command of commands) {
      assert.ok(
        pkg.scripts[name]?.includes(command),
        `${name} should carry the "${command}" stage after applying functions`
      );
    }
  }
});

test('applying the pack brings in the kit', () => {
  const dir = makeApp();
  applyPack(dir);

  for (const file of [
    'packages/frontend/src/lib/connectors.ts',
    'packages/frontend/src/hooks/use-semantic-model-query.ts',
  ]) {
    assert.ok(
      readFileSync(join(dir, file), 'utf8').length > 0,
      `${file} should have been copied in`
    );
  }

  // Charting is a separate pack, so analytics alone leaves it out entirely.
  const analyticsOnly = JSON.parse(
    readFileSync(join(dir, 'packages', 'frontend', 'package.json'), 'utf8')
  );
  assert.ok(
    !analyticsOnly.dependencies['@microsoft/fabric-visuals'],
    'analytics alone must not install the charting packages'
  );
  assert.ok(
    analyticsOnly.dependencies[
      '@microsoft/rayfin-connector-fabric-semanticmodel'
    ],
    'analytics installs the semantic model connector'
  );

  applyPack(dir, [], 'visuals');

  for (const file of [
    'scripts/validate-visual.mjs',
    'packages/frontend/src/lib/to-data-table.ts',
  ]) {
    assert.ok(
      readFileSync(join(dir, file), 'utf8').length > 0,
      `${file} should have been copied in`
    );
  }

  const pkg = JSON.parse(
    readFileSync(join(dir, 'packages', 'frontend', 'package.json'), 'utf8')
  );
  assert.ok(
    pkg.dependencies['@microsoft/fabric-visuals'],
    'visual packages should be added'
  );
  assert.ok(
    pkg.dependencies['@microsoft/rayfin-connector-fabric-semanticmodel'],
    'the analytics dependencies must survive a later pack'
  );
});

test('a pack carries its tooling dependencies into the app', () => {
  // The link between "the pack declares `yaml`" and "the validator can parse
  // the app's YAML": the validator fails when the parser cannot be loaded, so an
  // app that applied a pack without receiving it fails validation outright. The
  // pack suites assert declaration; this is the only cover for delivery, since
  // `yaml` is a devDependency and every other assertion here reads
  // `dependencies`.
  //
  // A fresh app per pack, deliberately: sharing one lets whichever pack runs
  // first satisfy the assertion for the second. The expected version comes from
  // the manifest so a bump cannot leave this asserting a stale pin.
  for (const pack of ['visuals']) {
    const dir = makeApp();
    applyPack(dir, [], pack);
    const manifest = JSON.parse(
      readFileSync(join(dir, '.agents', 'skills', pack, 'pack.json'), 'utf8')
    );
    const expected = manifest.devDependencies?.yaml;
    assert.ok(expected, `${pack}/pack.json should declare yaml`);
    const pkg = JSON.parse(
      readFileSync(join(dir, 'packages', 'frontend', 'package.json'), 'utf8')
    );
    assert.equal(
      pkg.devDependencies?.yaml,
      expected,
      `applying ${pack} on its own should install the yaml its validator imports`
    );
  }
});

test('the packs compose in either order', () => {
  // The packs are independent, so someone who charts sample data first and
  // connects a model later must end up with exactly what the other order
  // produces. This is where a later pack could quietly drop an earlier pack's
  // files or scripts.
  const dir = makeApp();
  applyPack(dir, [], 'visuals');
  applyPack(dir);

  for (const file of [
    'packages/frontend/src/lib/connectors.ts',
    'packages/frontend/src/hooks/use-semantic-model-query.ts',
    'packages/frontend/src/lib/to-data-table.ts',
    'scripts/validate-visual.mjs',
  ]) {
    assert.ok(
      readFileSync(join(dir, file), 'utf8').length > 0,
      `${file} should survive visuals -> analytics`
    );
  }

  const rootPkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const frontendPkg = JSON.parse(
    readFileSync(join(dir, 'packages', 'frontend', 'package.json'), 'utf8')
  );
  assert.ok(frontendPkg.dependencies['@microsoft/fabric-visuals']);
  assert.ok(
    frontendPkg.dependencies['@microsoft/rayfin-connector-fabric-semanticmodel']
  );
  assert.ok(rootPkg.scripts['validate:visual']);
});

test('the functions pack scaffolds a deployable typed functions project', () => {
  const dir = makeApp();
  applyPack(dir, [], 'functions');

  for (const file of [
    'packages/functions/package.json',
    'packages/functions/tsconfig.json',
    'packages/functions/host.json',
    'packages/functions/local.settings.json',
    'packages/functions/src/function_app.ts',
    'packages/functions/src/types.ts',
    'scripts/validate-functions.mjs',
  ]) {
    assert.ok(
      readFileSync(join(dir, file), 'utf8').length > 0,
      `${file} should have been copied in`
    );
  }

  const config = readFileSync(join(dir, 'rayfin', 'rayfin.yml'), 'utf8');
  // Properties land in the order the manifest declares them.
  assert.match(
    config,
    /functions:\n {4}enabled: true\n {4}path: "packages\/functions"\n {4}buildCommand: "npm run build"\n {4}auth:\n {6}type: "application"/u
  );

  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const frontendPkg = JSON.parse(
    readFileSync(join(dir, 'packages', 'frontend', 'package.json'), 'utf8')
  );
  assert.ok(pkg.rayfinPacks.includes('functions'));
  assert.equal(
    pkg.scripts['validate:functions'],
    'npm run -w @rayfin-app/shared build && node scripts/validate-functions.mjs'
  );
  for (const name of ['build', 'build:fabric', 'typecheck']) {
    const command = pkg.scripts[name];
    const sharedBuild = command.indexOf('npm run -w @rayfin-app/shared build');
    const validation = command.indexOf('node scripts/validate-functions.mjs');
    const functionsBuild = command.indexOf(
      'npm run -w @rayfin-app/functions build'
    );
    assert.ok(sharedBuild >= 0, `${name} does not build shared contracts`);
    assert.ok(
      validation > sharedBuild,
      `${name} validates Functions before building shared contracts`
    );
    assert.ok(validation >= 0, `${name} dropped Functions contract validation`);
    assert.ok(
      functionsBuild > validation,
      `${name} does not validate the generated contract before building Functions`
    );
  }
  assert.equal(frontendPkg.dependencies['@rayfin-app/functions'], '*');

  const functionsPkg = JSON.parse(
    readFileSync(join(dir, 'packages', 'functions', 'package.json'), 'utf8')
  );
  const functionsTsconfig = JSON.parse(
    readFileSync(join(dir, 'packages', 'functions', 'tsconfig.json'), 'utf8')
  );
  assert.equal(functionsPkg.name, '@rayfin-app/functions');
  assert.equal(functionsPkg.main, 'dist/function_app.js');
  assert.equal(functionsPkg.dependencies['@rayfin-app/shared'], undefined);
  assert.equal(functionsTsconfig.extends, '../../tsconfig.base.json');
  assert.equal(functionsTsconfig.compilerOptions.outDir, './dist');
  assert.equal(functionsTsconfig.compilerOptions.rootDir, './src');
  assert.deepEqual(
    functionsTsconfig.references,
    [{ path: '../shared' }],
    'functions should consume the shared workspace contract'
  );

  const client = readFileSync(
    join(dir, 'packages', 'frontend', 'src', 'lib', 'rayfin-client.ts'),
    'utf8'
  );
  assert.match(client, /AppFunctionsSchema/u);
  assert.match(client, /@rayfin-app\/functions\/types/u);
  assert.match(client, /@rayfin-app\/shared/u);
  assert.doesNotMatch(client, /functionsBaseUrl/u);
});

test('enabling existing Functions defaults only missing auth', () => {
  const dir = makeApp();
  const path = join(dir, 'rayfin', 'rayfin.yml');
  const before = readFileSync(path, 'utf8');
  writeFileSync(
    path,
    before.replace(
      /^services:\r?$/mu,
      'services:\n  functions:\n    enabled: false\n    path: authored/functions\n'
    )
  );

  applyPack(dir, [], 'functions');

  const config = readFileSync(path, 'utf8');
  assert.match(config, /functions:\n {4}enabled: true/u);
  assert.match(config, /^ {4}path: authored\/functions$/mu);
  assert.match(config, /^ {4}auth:\n {6}type: "application"$/mu);
  assert.equal(config.match(/^ {4}auth:/gmu).length, 1);
});

for (const auth of [
  '    auth: # authored auth\n      type: application # keep this comment',
  '    auth: { type: "application" } # keep flow style',
]) {
  test(`Functions reapplication preserves authored code, settings and ${auth.trim()}`, () => {
    const dir = makeApp();
    applyPack(dir, [], 'functions');
    const path = join(dir, 'rayfin', 'rayfin.yml');
    writeFileSync(
      path,
      readFileSync(path, 'utf8')
        .replace('    auth:\n      type: "application"', auth)
        .replace('path: "packages/functions"', 'path: authored/functions')
        .replace(
          'buildCommand: "npm run build"',
          'buildCommand: npm run authored-build'
        )
    );
    appendFileSync(
      join(dir, 'packages', 'functions', 'src', 'function_app.ts'),
      '\n// authored function implementation\n'
    );
    const before = snapshotApp(dir);

    applyPack(dir, [], 'functions');

    assertAppUnchanged(dir, before);
  });

  test(`--force-seeds preserves valid Functions ${auth.trim()}`, () => {
    const dir = makeApp();
    applyPack(dir, [], 'functions');
    const path = join(dir, 'rayfin', 'rayfin.yml');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace(
        '    auth:\n      type: "application"',
        auth
      )
    );
    const before = readFileSync(path, 'utf8');

    applyPack(dir, ['--force-seeds'], 'functions');

    assert.equal(readFileSync(path, 'utf8'), before);
  });
}

for (const alreadyApplied of [false, true]) {
  for (const enabled of [false, true]) {
    for (const force of [false, true]) {
      test(`invalid Functions auth changes nothing (reapply=${alreadyApplied}, enabled=${enabled}, force=${force})`, () => {
        const dir = makeApp();
        const path = join(dir, 'rayfin', 'rayfin.yml');
        const baseConfig = readFileSync(path, 'utf8');
        if (alreadyApplied) applyPack(dir, [], 'functions');
        const source = join(
          dir,
          'packages',
          'functions',
          'src',
          'function_app.ts'
        );
        mkdirSync(dirname(source), { recursive: true });
        writeFileSync(
          source,
          '// keep authored functions, even with --force-seeds\n'
        );

        for (const auth of [
          '    auth:\n      type: delegated',
          '    auth: { type: unknown }',
          '    auth: null',
          '    auth:',
          '    auth: {}',
          '    auth:\n      other: application',
          '    auth: application',
          '    "auth": { type: delegated }',
          '    auth:\n      type: application\n      type: delegated',
          '    auth: { type: application }\n      orphan: true',
        ]) {
          writeFileSync(
            path,
            baseConfig.replace(
              /^services:\r?$/mu,
              `services:\n  functions:\n    enabled: ${enabled}\n    path: authored/functions\n${auth}`
            )
          );
          const before = snapshotApp(dir);
          const result = spawnSync(
            process.execPath,
            [
              join(dir, 'scripts', 'scaffold.mjs'),
              'functions',
              '--no-install',
              ...(force ? ['--force-seeds'] : []),
            ],
            { cwd: dir, encoding: 'utf8' }
          );
          assert.ifError(result.error);
          assert.equal(result.status, 1, auth);
          assert.match(
            result.stderr,
            /services\.functions\.auth\.type[\s\S]*application/u
          );
          assertAppUnchanged(dir, before);
        }
      });
    }
  }
}

test('the functions pack creates only the opt-in workspace member', () => {
  const dir = makeApp();
  const baseConfig = readFileSync(join(dir, 'rayfin', 'rayfin.yml'), 'utf8');

  assert.equal(existsSync(join(dir, 'rayfin', 'functions')), false);
  assert.equal(existsSync(join(dir, 'packages', 'functions')), false);
  assert.doesNotMatch(baseConfig, /functions:/u);

  applyPack(dir, [], 'functions');

  const config = readFileSync(join(dir, 'rayfin', 'rayfin.yml'), 'utf8');
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const pack = JSON.parse(
    readFileSync(
      join(dir, '.agents', 'skills', 'functions-capability', 'pack.json'),
      'utf8'
    )
  );
  assert.equal(existsSync(join(dir, 'rayfin', 'functions')), false);
  assert.equal(existsSync(join(dir, 'packages', 'functions')), true);
  assert.match(
    config,
    /functions:\n(?: {4}.*\n)* {4}path: "packages\/functions"/u
  );
  assert.deepEqual(pkg.rayfinPacks, ['functions']);
  assert.match(pkg.scripts.build, /npm run -w @rayfin-app\/functions build/u);
  assert.equal(pack.installDirectories, undefined);
});

test('root personalization does not rename stable workspace members', () => {
  const dir = makeApp();
  const rootPkgPath = join(dir, 'package.json');
  const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'));
  rootPkg.name = 'personalized-app';
  rootPkg.template.name = 'personalized-app';
  writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n', 'utf8');

  applyPack(dir, [], 'functions');

  for (const [member, expected] of [
    ['frontend', '@rayfin-app/frontend'],
    ['data', '@rayfin-app/data'],
    ['shared', '@rayfin-app/shared'],
    ['functions', '@rayfin-app/functions'],
  ]) {
    const memberPkg = JSON.parse(
      readFileSync(join(dir, 'packages', member, 'package.json'), 'utf8')
    );
    assert.equal(memberPkg.name, expected);
  }
  assert.equal(
    JSON.parse(readFileSync(rootPkgPath, 'utf8')).name,
    'personalized-app'
  );
});

test('a skill-directory alias records and composes the canonical pack', () => {
  const dir = makeApp();
  const clientPath = join(
    dir,
    'packages',
    'frontend',
    'src',
    'lib',
    'rayfin-client.ts'
  );
  appendFileSync(clientPath, '\n// preserve this customization\n', 'utf8');

  const output = applyPack(dir, [], 'functions-capability');
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

  assert.deepEqual(pkg.rayfinPacks, ['functions']);
  assert.match(pkg.scripts.build, /npm run -w @rayfin-app\/functions build/u);
  assert.match(
    output,
    /\.agents\/skills\/functions-capability\/kit\/rayfin-client\.ts/u
  );
});

test('functions build supports a type-only import from shared data', (t) => {
  const dir = makeApp();
  applyPack(dir, [], 'functions');
  writeFileSync(
    join(dir, 'packages', 'functions', 'src', 'function_app.ts'),
    [
      "import type { UniversalAppSchema } from '../../shared/src/index.js';",
      '',
      'export function acceptsSharedSchema(_value: UniversalAppSchema): void {}',
      '',
    ].join('\n'),
    'utf8'
  );

  let tsc;
  try {
    tsc = join(dirname(require.resolve('typescript')), 'tsc.js');
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') throw error;
    t.skip('TypeScript is not installed in this template checkout');
    return;
  }
  const nodeTypes = dirname(require.resolve('@types/node/package.json'));
  const nodeTypesTarget = join(dir, 'node_modules', '@types', 'node');
  mkdirSync(dirname(nodeTypesTarget), { recursive: true });
  symlinkSync(nodeTypes, nodeTypesTarget, 'junction');
  execFileSync(
    process.execPath,
    [tsc, '--build', join(dir, 'packages', 'functions', 'tsconfig.json')],
    { cwd: dir, stdio: 'inherit' }
  );

  const outputPath = join(
    dir,
    'packages',
    'functions',
    'dist',
    'function_app.js'
  );
  assert.ok(existsSync(outputPath), 'missing deployable functions entrypoint');
  assert.doesNotMatch(
    readFileSync(outputPath, 'utf8'),
    /shared/u,
    'type-only shared schema import must be erased from deployed JavaScript'
  );
});

// `functions` is the only shipped pack contributing to `build`, so the
// composition counterpart is synthetic.
const COMPOSE_PEER = 'node scripts/compose-peer.mjs';

function writeComposePeer(dir) {
  const packDir = join(dir, '.agents', 'skills', 'compose-peer-capability');
  mkdirSync(packDir, { recursive: true });
  writeFileSync(
    join(packDir, 'pack.json'),
    JSON.stringify(
      {
        // Sorts before `functions`, so the expected order is deterministic.
        name: 'compose-peer',
        scriptStages: {
          build: [COMPOSE_PEER],
          'build:fabric': [COMPOSE_PEER],
          typecheck: [COMPOSE_PEER],
        },
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
}

for (const order of [
  ['functions', 'compose-peer'],
  ['compose-peer', 'functions'],
]) {
  test(`capability scripts compose when applied ${order.join(' then ')}`, () => {
    const dir = makeApp();
    writeComposePeer(dir);
    for (const pack of order) applyPack(dir, [], pack);

    const scripts = JSON.parse(
      readFileSync(join(dir, 'package.json'), 'utf8')
    ).scripts;
    for (const name of ['build', 'build:fabric', 'typecheck']) {
      const command = scripts[name];
      const peer = command.indexOf(COMPOSE_PEER);
      const sharedBuild = command.indexOf(
        'npm run -w @rayfin-app/shared build'
      );
      const validation = command.indexOf('node scripts/validate-functions.mjs');
      const functions = command.indexOf(
        'npm run -w @rayfin-app/functions build'
      );
      const remainingBase = command.indexOf(
        name === 'typecheck' ? 'tsc -b' : 'npm run -w @rayfin-app/data build'
      );

      assert.ok(peer >= 0, `${name} dropped the peer stage`);
      assert.ok(sharedBuild > peer, `${name} has unstable pack stage order`);
      assert.ok(
        validation > sharedBuild,
        `${name} validates before building shared contracts`
      );
      assert.ok(functions > validation, `${name} builds before validation`);
      assert.ok(
        remainingBase > functions,
        `${name} drops the remaining base build stages`
      );
      assert.equal(
        command.split(COMPOSE_PEER).length - 1,
        1,
        `${name} duplicated the peer stage`
      );
      assert.equal(
        command.split('npm run -w @rayfin-app/functions build').length - 1,
        1,
        `${name} duplicated the functions build`
      );
    }
  });
}

test('applying another pack preserves user-added script stages', () => {
  const dir = makeApp();
  writeComposePeer(dir);
  applyPack(dir, [], 'compose-peer');

  const pkgPath = join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.scripts.build += ' && node scripts/custom-build.mjs';
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  applyPack(dir, [], 'functions');

  const build = JSON.parse(readFileSync(pkgPath, 'utf8')).scripts.build;
  assert.match(build, /node scripts\/compose-peer\.mjs/u);
  assert.match(build, /npm run -w @rayfin-app\/functions build/u);
  assert.match(build, /node scripts\/custom-build\.mjs/u);
});

test('a pack can originate a new composed script', () => {
  const dir = makeApp();
  const packDir = join(dir, '.agents', 'skills', 'new-script-capability');
  mkdirSync(packDir, { recursive: true });
  writeFileSync(
    join(packDir, 'pack.json'),
    JSON.stringify(
      {
        name: 'new-script',
        scriptStages: {
          'validate:new': ['node scripts/validate-new.mjs'],
        },
      },
      null,
      2
    ) + '\n',
    'utf8'
  );

  applyPack(dir, [], 'new-script');

  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['validate:new'], 'node scripts/validate-new.mjs');
  assert.ok(pkg.rayfinPacks.includes('new-script'));
});

test('composed stages use canonical pack-name order', () => {
  const dir = makeApp();
  for (const [directory, name, stage] of [
    ['z-alpha-directory', 'alpha-stage', 'node scripts/alpha.mjs'],
    ['a-omega-directory', 'omega-stage', 'node scripts/omega.mjs'],
  ]) {
    const packDir = join(dir, '.agents', 'skills', directory);
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, 'pack.json'),
      JSON.stringify(
        {
          name,
          scriptStages: { 'validate:ordered': [stage] },
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
  }

  applyPack(dir, [], 'alpha-stage');
  applyPack(dir, [], 'omega-stage');

  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  assert.equal(
    pkg.scripts['validate:ordered'],
    'node scripts/alpha.mjs && node scripts/omega.mjs'
  );
});

test('a pack without script contributions does not add an empty scripts map', () => {
  const dir = makeApp();
  const pkgPath = join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  delete pkg.scripts;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  const packDir = join(dir, '.agents', 'skills', 'service-only');
  mkdirSync(packDir, { recursive: true });
  writeFileSync(
    join(packDir, 'pack.json'),
    JSON.stringify({ name: 'service-only' }, null, 2) + '\n',
    'utf8'
  );

  applyPack(dir, [], 'service-only');

  const updated = JSON.parse(readFileSync(pkgPath, 'utf8'));
  assert.equal(updated.scripts, undefined);
});

test('malformed unrelated manifests fail before changing the app', () => {
  const dir = makeApp();
  const configPath = join(dir, 'rayfin', 'rayfin.yml');
  const originalConfig = readFileSync(configPath, 'utf8');
  const broken = join(dir, '.agents', 'skills', 'broken');
  mkdirSync(broken, { recursive: true });
  writeFileSync(join(broken, 'pack.json'), '{ not-json', 'utf8');

  assert.throws(
    () => applyPack(dir, [], 'functions'),
    (error) => {
      const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
      assert.match(output, /Malformed pack manifest: .*broken[\\/]pack\.json/u);
      assert.doesNotMatch(output, /\n {4}at JSON\.parse/u);
      return true;
    }
  );
  assert.equal(readFileSync(configPath, 'utf8'), originalConfig);
});

test('--no-install prints one root workspace recovery command', () => {
  const dir = makeApp();
  const output = applyPack(dir, [], 'functions');

  assert.match(output, /npm install --ignore-scripts --no-audit --no-fund/u);
  assert.doesNotMatch(output, /npm --prefix/u);
});

test('re-applying the functions pack preserves authored UDFs', () => {
  const dir = makeApp();
  applyPack(dir, [], 'functions');
  const functionPath = join(
    dir,
    'packages',
    'functions',
    'src',
    'function_app.ts'
  );
  appendFileSync(functionPath, '\n// authored function\n', 'utf8');

  const output = applyPack(dir, [], 'functions');

  assert.match(readFileSync(functionPath, 'utf8'), /authored function/u);
  assert.match(output, /Kept your customized file/u);
});

test('the opt-in functions workspace installs, builds, tests, and reapplies offline', (t) => {
  if (!existsSync(join(TEMPLATE, 'package-lock.json'))) {
    t.skip('requires the prepared harness target and its resolved lockfile');
    return;
  }

  const dir = makeApp();
  const configPath = join(dir, 'rayfin', 'rayfin.yml');
  assert.equal(existsSync(join(dir, 'packages', 'functions')), false);
  assert.doesNotMatch(readFileSync(configPath, 'utf8'), /^ {2}functions:/mu);

  const packOutput = applyPack(dir, [], 'functions');
  const functionsManifestPath = join(
    dir,
    'packages',
    'functions',
    'package.json'
  );
  const functionsManifest = JSON.parse(
    readFileSync(functionsManifestPath, 'utf8')
  );
  assert.equal(functionsManifest.name, '@rayfin-app/functions');
  assert.match(
    functionsManifest.dependencies['@microsoft/fabric-user-data-functions'],
    /^(?:workspace:\*|\^\d+\.\d+\.\d+)/u,
    'the functions worker must track a Rayfin release line, not a pinned build'
  );
  assert.match(
    packOutput,
    /npm install --ignore-scripts --no-audit --no-fund/u
  );

  const mockDirectory = join(
    dir,
    'mock-packages',
    'fabric-user-data-functions'
  );
  mkdirSync(mockDirectory, { recursive: true });
  writeFileSync(
    join(mockDirectory, 'package.json'),
    JSON.stringify(
      {
        name: '@microsoft/fabric-user-data-functions',
        version: '1.36.0-alpha.0',
        type: 'module',
        exports: { '.': { types: './index.d.ts', default: './index.js' } },
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
  writeFileSync(
    join(mockDirectory, 'index.d.ts'),
    'export class UserDataFunctions { func(name: string, handler: (...args: never[]) => unknown, metadata: unknown[]): void; }\n',
    'utf8'
  );
  writeFileSync(
    join(mockDirectory, 'index.js'),
    'export class UserDataFunctions { func() {} }\n',
    'utf8'
  );
  functionsManifest.dependencies['@microsoft/fabric-user-data-functions'] =
    'file:../../mock-packages/fabric-user-data-functions';
  writeFileSync(
    functionsManifestPath,
    JSON.stringify(functionsManifest, null, 2) + '\n',
    'utf8'
  );

  for (const args of [
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--offline'],
    ['run', 'build'],
    ['test'],
  ]) {
    runNpm(args, { cwd: dir, stdio: 'inherit' });
  }

  const authoredFunction = join(
    dir,
    'packages',
    'functions',
    'src',
    'function_app.ts'
  );
  appendFileSync(authoredFunction, '\n// authored after validation\n', 'utf8');
  const secondOutput = applyPack(dir, [], 'functions');
  assert.match(
    readFileSync(authoredFunction, 'utf8'),
    /authored after validation/u
  );
  assert.match(secondOutput, /Kept your customized file/u);
});

test('re-applying the pack does not disconnect a configured connector', () => {
  // The failure this prevents: pack -> connect a model -> pack again, and the
  // connection is silently reset. The connection lives in `rayfin/rayfin.yml`,
  // which the pack must only ever amend.
  const dir = makeApp();
  applyPack(dir);
  const ymlPath = join(dir, 'rayfin', 'rayfin.yml');
  const configured =
    readFileSync(ymlPath, 'utf8') +
    '\nconnectors:\n  - alias: sales\n    type: fabric-semanticmodel\n';
  writeFileSync(ymlPath, configured, 'utf8');

  applyPack(dir);

  assert.match(
    readFileSync(ymlPath, 'utf8'),
    /alias: sales/u,
    'the configured connection must survive a second apply'
  );
});

test('the analytics pack never overwrites CLI-generated connector maps', () => {
  const dir = makeApp();
  applyPack(dir);
  const wiringPath = join(
    dir,
    'packages',
    'frontend',
    'src',
    'lib',
    'connectors.ts'
  );
  const generated =
    '// @generated by `rayfin connector add`\nexport const connected = true;\n';
  writeFileSync(wiringPath, generated, 'utf8');

  const ordinary = applyPack(dir);
  const forced = applyPack(dir, ['--force-seeds']);

  assert.equal(readFileSync(wiringPath, 'utf8'), generated);
  assert.doesNotMatch(ordinary, /Kept your customized file/u);
  assert.doesNotMatch(forced, /Kept your customized file/u);
});

test('re-applying the pack does not discard edits to copied files', () => {
  const dir = makeApp();
  applyPack(dir, [], 'visuals');
  appendFileSync(
    join(dir, 'packages', 'frontend', 'src', 'lib', 'to-data-table.ts'),
    '\n// tuned by hand\n',
    'utf8'
  );

  const output = applyPack(dir, [], 'visuals');

  assert.match(
    readFileSync(
      join(dir, 'packages', 'frontend', 'src', 'lib', 'to-data-table.ts'),
      'utf8'
    ),
    /tuned by hand/u,
    'a hand-edited kit file must survive a second apply'
  );
  assert.match(
    output,
    /Kept your customized file/u,
    'the run should say what it preserved'
  );
});

test('the data pack writes the dialect the host requires', () => {
  // Two rules pull in opposite directions: the host rejects a data service
  // enabled without a dialect, and the template contract rejects a dialect on a
  // service left off. Only the pack can satisfy both, and a live deploy is the
  // only thing that catches it -- `up --dry-run` posts no settings.
  const dir = makeApp();
  assert.doesNotMatch(
    readFileSync(join(dir, 'rayfin', 'rayfin.yml'), 'utf8'),
    /dialect/u,
    'the template ships no dialect while data is off'
  );

  applyPack(dir, [], 'data-modeling');

  const yml = readFileSync(join(dir, 'rayfin', 'rayfin.yml'), 'utf8');
  assert.match(yml, /data:\s*\n\s*enabled:\s*true/u, 'data must be enabled');
  assert.match(yml, /^\s{4}dialect:\s*"?mssql"?/mu, 'and carry a dialect');
});

test('re-applying a pack keeps a dialect the Builder changed', () => {
  // The pack ships `mssql`, but the dialect is the Builder's to change. Resetting
  // it on a re-apply would point the next deploy at a different database than the
  // one the app was built against, and nothing would say so.
  const dir = makeApp();
  applyPack(dir, [], 'data-modeling');

  const ymlPath = join(dir, 'rayfin', 'rayfin.yml');
  // Hand-edited the way a Builder would, without the quotes the pack writes —
  // preserving the choice must not depend on matching its exact spelling.
  writeFileSync(
    ymlPath,
    readFileSync(ymlPath, 'utf8').replace(
      /^(\s{4}dialect:\s*).*$/mu,
      '$1postgresql'
    )
  );

  const out = applyPack(dir, [], 'data-modeling');

  const yml = readFileSync(ymlPath, 'utf8');
  assert.match(
    yml,
    /^\s{4}dialect:\s*"?postgresql"?/mu,
    'the choice must survive'
  );
  assert.doesNotMatch(yml, /dialect:\s*"?mssql"?/u, 'and must not be reset');
  assert.match(
    out,
    /kept your data\.dialect/u,
    'the run should say what it kept'
  );
});

test('a comment in the file does not defeat dialect preservation', () => {
  // The two mechanisms are unit-tested apart, and this is where they meet: a
  // scanner that stopped at a comment would never reach the property below it,
  // so preservation could not fire and the Builder's choice would be appended
  // over rather than kept. One comment would silently switch the guarantee off.
  const dir = makeApp();
  applyPack(dir, [], 'data-modeling');

  const ymlPath = join(dir, 'rayfin', 'rayfin.yml');
  writeFileSync(
    ymlPath,
    readFileSync(ymlPath, 'utf8').replace(
      /^(\s{4})dialect:\s*.*$/mu,
      '  # the database this app was built against\n$1dialect: postgresql'
    )
  );

  const out = applyPack(dir, [], 'data-modeling');

  const yml = readFileSync(ymlPath, 'utf8');
  assert.match(
    yml,
    /^\s{4}dialect:\s*"?postgresql"?/mu,
    'the choice must survive a comment above it'
  );
  assert.equal(
    yml.match(/^\s{4}dialect:/gmu).length,
    1,
    'and must not be duplicated'
  );
  assert.match(
    out,
    /kept your data\.dialect/u,
    'the run should say what it kept'
  );
});

test('re-applying a pack still turns its service back on', () => {
  // `enabled` is the switch the pack exists to flip, so unlike the settings
  // around it, a re-apply is expected to restore it.
  const dir = makeApp();
  applyPack(dir, [], 'data-modeling');

  const ymlPath = join(dir, 'rayfin', 'rayfin.yml');
  writeFileSync(
    ymlPath,
    readFileSync(ymlPath, 'utf8').replace(
      /^(\s{2}data:\s*\n\s{4}enabled:\s*)true/mu,
      '$1false'
    )
  );

  applyPack(dir, [], 'data-modeling');

  assert.match(
    readFileSync(ymlPath, 'utf8'),
    /data:\s*\n\s*enabled:\s*true/u,
    'the pack must re-enable its own service'
  );
});

test('the data pack turns the service on and plants a starter entity', () => {
  const dir = makeApp();
  applyPack(dir, [], 'data-modeling');

  assert.match(
    readFileSync(join(dir, 'rayfin', 'rayfin.yml'), 'utf8'),
    /data:\s*\n\s*enabled:\s*true/u,
    'the pack must enable the data service'
  );
  assert.match(
    readFileSync(join(dir, 'packages', 'data', 'src', 'Item.ts'), 'utf8'),
    /@entity\(\)/u,
    'the starter entity should be copied in'
  );
  assert.match(
    readFileSync(join(dir, 'packages', 'data', 'src', 'index.ts'), 'utf8'),
    /Item/u,
    'the entity must be registered in the schema'
  );
  assert.match(
    readFileSync(join(dir, 'packages', 'shared', 'src', 'index.ts'), 'utf8'),
    /ItemRecord/u,
    'the browser-safe entity contract must be shared with the frontend'
  );
});

test('the data pack does not discard entities added after it ran', () => {
  // The schema is a seed: the whole point of the pack is that an agent edits it
  // afterwards. Re-applying must not silently delete the app's real model.
  const dir = makeApp();
  applyPack(dir, [], 'data-modeling');
  const schemaPath = join(dir, 'packages', 'data', 'src', 'index.ts');
  appendFileSync(schemaPath, '\n// Invoice added by hand\n', 'utf8');

  applyPack(dir, [], 'data-modeling');

  assert.match(
    readFileSync(schemaPath, 'utf8'),
    /Invoice added by hand/u,
    'an edited schema must survive a second apply'
  );
});

test('the connectors pack pins the SDK to the core version line', () => {
  // The pack seeds app-side wiring and the SDK, but no service block:
  // `rayfin connector add` owns the top-level connector declarations and the
  // commands are always available.
  const dir = makeApp();
  const rayfinPath = join(dir, 'rayfin', 'rayfin.yml');
  const rayfinBefore = readFileSync(rayfinPath, 'utf8');
  applyPack(dir, [], 'connectors');
  assert.equal(
    readFileSync(rayfinPath, 'utf8'),
    rayfinBefore,
    'the connectors pack must not add a legacy services.connectors block'
  );

  // Rayfin packages ship as one version line. A literal pin would be right the
  // day it was written and quietly skewed one release later, which shows up as
  // cross-package type errors rather than an install failure.
  const frontendPath = join(dir, 'packages', 'frontend', 'package.json');
  const frontendPkg = JSON.parse(readFileSync(frontendPath, 'utf8'));
  const dataPkg = JSON.parse(
    readFileSync(join(dir, 'packages', 'data', 'package.json'), 'utf8')
  );
  const connectorsSpec =
    frontendPkg.dependencies['@microsoft/rayfin-connectors'];
  const coreSpec = dataPkg.dependencies['@microsoft/rayfin-core'];
  if (coreSpec.startsWith('file:')) {
    assert.match(connectorsSpec, /^file:/u);
    assert.equal(
      basename(resolve(dirname(frontendPath), connectorsSpec.slice(5))),
      'connectors',
      'a locally linked core must resolve connectors to its sibling package'
    );
  } else {
    assert.equal(
      connectorsSpec,
      coreSpec,
      'connectors must track whatever version core is on'
    );
  }
  assert.doesNotMatch(
    connectorsSpec,
    /^match:/u,
    'the sentinel must be resolved, not written through to package.json'
  );
});

test('the connectors pack never overwrites CLI-generated wiring', () => {
  const dir = makeApp();
  applyPack(dir, [], 'connectors');
  const wiringPath = join(
    dir,
    'packages',
    'frontend',
    'src',
    'lib',
    'connectors.ts'
  );
  const generated =
    '// @generated by `rayfin connector add`\nexport const connected = true;\n';
  writeFileSync(wiringPath, generated, 'utf8');

  const ordinary = applyPack(dir, [], 'connectors');
  const forced = applyPack(dir, ['--force-seeds'], 'connectors');

  assert.equal(readFileSync(wiringPath, 'utf8'), generated);
  assert.doesNotMatch(ordinary, /Kept your customized file/u);
  assert.doesNotMatch(forced, /Kept your customized file/u);
});

function permutations(values) {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) =>
    permutations(values.filter((_, other) => other !== index)).map((rest) => [
      value,
      ...rest,
    ])
  );
}

const E2E_TEST_PACKS = JSON.parse(
  readFileSync(join(TEMPLATE, 'scripts', 'e2e-pack-coverage.json'), 'utf8')
).testPacks;
const COMPLETE_STACK = [
  ...new Set(E2E_TEST_PACKS.flatMap(({ capabilityPacks }) => capabilityPacks)),
].sort();

for (const order of permutations([
  'data-modeling',
  'connectors',
  'functions',
])) {
  test(`all client capabilities compose when applied ${order.join(' then ')}`, () => {
    const dir = makeApp();
    const outputs = order.map((pack) => applyPack(dir, [], pack));

    for (const output of outputs) {
      assert.doesNotMatch(
        output,
        /Kept your customized file/u,
        'a fresh composition should never require a manual client merge'
      );
    }

    for (const pack of order) {
      assert.doesNotMatch(
        applyPack(dir, [], pack),
        /Kept your customized file/u,
        'reapplying composed packs should not require a manual client merge'
      );
    }

    const config = readFileSync(join(dir, 'rayfin', 'rayfin.yml'), 'utf8');
    for (const service of ['data', 'functions']) {
      assert.match(
        config,
        new RegExp(`${service}:\\s*\\n\\s*enabled:\\s*true`, 'u'),
        `${service} service was not enabled`
      );
    }
    assert.doesNotMatch(
      config,
      /^ {2}connectors:/mu,
      'the SDK-only pack must leave connector configuration to the CLI'
    );

    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    assert.deepEqual(pkg.rayfinPacks, [
      'connectors',
      'data-modeling',
      'functions',
    ]);
    for (const name of ['build', 'build:fabric', 'typecheck']) {
      assert.match(
        pkg.scripts[name],
        /npm run -w @rayfin-app\/functions build/u,
        `${name} dropped the functions build`
      );
    }

    const client = readFileSync(
      join(dir, 'packages', 'frontend', 'src', 'lib', 'rayfin-client.ts'),
      'utf8'
    );
    assert.match(
      client,
      /ConnectorsRayfinClient<\s*UniversalAppSchema,\s*AppFunctionsSchema,\s*AppConnectorsSchema/u
    );
    assert.doesNotMatch(client, /VITE_RAYFIN_FUNCTIONS_URL/u);
    assert.doesNotMatch(client, /functionsBaseUrl/u);
  });
}

for (const order of permutations(COMPLETE_STACK)) {
  test(`the full registered pack stack composes when applied ${order.join(' then ')}`, () => {
    const dir = makeApp();
    const outputs = order.map((pack) => applyPack(dir, [], pack));

    for (const output of outputs) {
      assert.doesNotMatch(
        output,
        /Kept your customized (?:file|script)/u,
        'a fresh full-stack app should not require a manual merge'
      );
    }

    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    assert.deepEqual(pkg.rayfinPacks, [...COMPLETE_STACK].sort());
    assert.ok(pkg.scripts['validate:visual']);
    assert.equal(
      pkg.scripts['validate:visual:preview'],
      'node scripts/validate-visual.mjs --allow-incomplete'
    );
    for (const name of ['build', 'build:fabric', 'typecheck']) {
      assert.equal(
        pkg.scripts[name].split('npm run -w @rayfin-app/functions build')
          .length - 1,
        1,
        `${name} should build functions exactly once`
      );
    }

    for (const file of [
      'scripts/validate-visual.mjs',
      'packages/frontend/src/lib/to-data-table.ts',
      'packages/frontend/src/lib/connectors.ts',
      'packages/data/src/Item.ts',
      'packages/functions/src/function_app.ts',
    ]) {
      assert.ok(existsSync(join(dir, file)), `${file} was dropped`);
    }

    const client = readFileSync(
      join(dir, 'packages', 'frontend', 'src', 'lib', 'rayfin-client.ts'),
      'utf8'
    );
    assert.match(client, /AppFunctionsSchema/u);
    assert.match(
      client,
      /ConnectorsRayfinClient<\s*UniversalAppSchema,\s*AppFunctionsSchema,\s*AppConnectorsSchema/u
    );
  });
}

test('a match pin fails when workspace members declare conflicting versions', () => {
  const dir = makeApp();
  const frontendPath = join(dir, 'packages', 'frontend', 'package.json');
  const frontendPkg = JSON.parse(readFileSync(frontendPath, 'utf8'));
  frontendPkg.dependencies['@microsoft/rayfin-core'] = '^1.36.0-alpha';
  frontendPkg.devDependencies['@microsoft/rayfin-core'] = '^0.0.0-conflict';
  writeFileSync(
    frontendPath,
    JSON.stringify(frontendPkg, null, 2) + '\n',
    'utf8'
  );

  assert.throws(
    () => applyPack(dir, [], 'connectors'),
    (error) => {
      assert.match(String(error.stderr), /conflicting versions/u);
      assert.match(String(error.stderr), /packages\/data\/package\.json/u);
      assert.match(String(error.stderr), /packages\/frontend\/package\.json/u);
      return true;
    }
  );
});

test('a pack that adds rayfin sources clears the stale build stamp', () => {
  // Build once, add a pack, type-check: `tsc -b` used to trust the old stamp and
  // fail with TS6305 naming a file the user never touched.
  const dir = makeApp();
  const stamp = join(dir, 'packages', 'data', '.tsbuildinfo');
  mkdirSync(dirname(stamp), { recursive: true });
  writeFileSync(stamp, '{"stale":true}', 'utf8');

  applyPack(dir, [], 'data-modeling');

  assert.equal(
    existsSync(stamp),
    false,
    'adding sources to the rayfin project must invalidate its build stamp'
  );
});

test('a re-apply that writes nothing leaves the build stamp alone', () => {
  // Clearing it unconditionally would force a full rebuild on every re-apply,
  // even though preserving every file means no source actually changed.
  const dir = makeApp();
  applyPack(dir, [], 'data-modeling');

  const stamp = join(dir, 'packages', 'data', '.tsbuildinfo');
  mkdirSync(dirname(stamp), { recursive: true });
  writeFileSync(stamp, '{"fresh":true}', 'utf8');

  applyPack(dir, [], 'data-modeling');

  assert.equal(
    existsSync(stamp),
    true,
    'nothing was written, so the stamp is still valid'
  );
});

test('--force-seeds overwrites what a plain re-apply preserves', () => {
  const dir = makeApp();
  applyPack(dir);
  // A file copied as part of a directory, not as a single named entry. The two
  // travel different code paths, and the flag has to reach both — otherwise the
  // run reports "re-run with --force-seeds" about files the flag cannot touch.
  appendFileSync(
    join(
      dir,
      'packages',
      'frontend',
      'src',
      'hooks',
      'use-semantic-model-query.ts'
    ),
    '\n// tuned by hand\n',
    'utf8'
  );

  applyPack(dir, ['--force-seeds']);

  assert.doesNotMatch(
    readFileSync(
      join(
        dir,
        'packages',
        'frontend',
        'src',
        'hooks',
        'use-semantic-model-query.ts'
      ),
      'utf8'
    ),
    /tuned by hand/u,
    'force must reach files copied as part of a directory, as the message promises'
  );
});

test('re-applying the pack does not discard an edited package script', () => {
  // Scripts travel a different path from the copied files, so they need their
  // own guard: rewriting them unconditionally resets a tuned build command on
  // every re-apply — the same class of bug as clobbering a configured
  // connector, just harder to notice.
  const dir = makeApp();
  applyPack(dir, [], 'functions');
  const pkgPath = join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.scripts.build = 'my custom build';
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  const output = applyPack(dir, [], 'functions');

  assert.equal(
    JSON.parse(readFileSync(pkgPath, 'utf8')).scripts.build,
    'my custom build',
    'an edited script must survive a second apply'
  );
  assert.match(
    output,
    /Kept your customized script/u,
    'the run should say what it preserved'
  );
});

test('--force-seeds takes an edited package script back', () => {
  const dir = makeApp();
  applyPack(dir, [], 'functions');
  const pkgPath = join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.scripts.build = 'my custom build';
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  applyPack(dir, ['--force-seeds'], 'functions');

  assert.match(
    JSON.parse(readFileSync(pkgPath, 'utf8')).scripts.build,
    /npm run -w @rayfin-app\/functions build/u,
    'force is the documented way back to the pack version'
  );
});

test('an edited script survives even after a dependency version drifts', () => {
  // Reading "all pinned deps match" as "the pack ran before" made a version
  // upgrade look like a first apply and clobbered the scripts this protects.
  // No shipped pack carries both pinned deps and staged scripts, so the pack
  // under test is synthetic.
  const dir = makeApp();
  const packDir = join(dir, '.agents', 'skills', 'drifting-capability');
  mkdirSync(packDir, { recursive: true });
  writeFileSync(
    join(packDir, 'pack.json'),
    JSON.stringify(
      {
        name: 'drifting',
        dependencies: { '@microsoft/example-drifting': '1.0.0' },
        scriptStages: { build: ['node scripts/drifting.mjs'] },
      },
      null,
      2
    ) + '\n',
    'utf8'
  );

  applyPack(dir, [], 'drifting');
  const pkgPath = join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.dependencies['@microsoft/example-drifting'] = '99.0.0';
  pkg.scripts.build = 'my custom build';
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  applyPack(dir, [], 'drifting');

  assert.equal(
    JSON.parse(readFileSync(pkgPath, 'utf8')).scripts.build,
    'my custom build',
    'a version bump is not permission to reset customized scripts'
  );
});

test('a kit file written before the pack does not look like a prior apply', () => {
  // A file the pack copies can already exist — hand-authored, or left by an
  // earlier experiment. Inferring "already applied" from that left `build`
  // bare, so the app deployed without the pack's stage ever running: a silent,
  // and total, failure.
  const dir = makeApp();
  const seeded = join(dir, 'packages', 'functions', 'src', 'function_app.ts');
  mkdirSync(dirname(seeded), { recursive: true });
  writeFileSync(seeded, '// authored before the pack\n', 'utf8');

  applyPack(dir, [], 'functions');

  assert.match(
    JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts.build,
    /npm run -w @rayfin-app\/functions build/u,
    'a first apply must wire the build even when a kit file already exists'
  );
});

test('--no-install then a plain re-apply still installs', () => {
  // package.json is already correct after the first run, so "did the manifest
  // change?" says no - but the packages were never fetched. The decision turns
  // on a marker written after npm exits zero, so the whole branch can be tested
  // here without a network or a five-minute install.
  const dir = makeApp();
  applyPack(dir, ['--no-install']);
  const packJson = JSON.parse(
    readFileSync(
      join(dir, '.agents', 'skills', 'analytics', 'pack.json'),
      'utf8'
    )
  );
  const pinned = {
    ...(packJson.dependencies ?? {}),
    ...(packJson.devDependencies ?? {}),
  };
  const decide = (over = {}) =>
    shouldInstallPackDependencies({
      root: dir,
      pack: 'analytics',
      pinned,
      depsChanged: false,
      dryRun: false,
      noInstall: false,
      ...over,
    });

  assert.equal(decide().install, true, 'nothing was installed yet, so install');

  // What a successful install leaves behind.
  const marker = join(dir, 'node_modules', '.rayfin-packs', 'analytics.json');
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(
    marker,
    JSON.stringify({ pack: 'analytics', deps: depsFingerprint(pinned) }),
    'utf8'
  );
  assert.equal(
    decide().install,
    false,
    'a recorded install of this exact set needs no repeat'
  );

  // A half-finished install never gets that far, so the record is absent and the
  // next run tries again - the case a "are the folders there?" check missed.
  rmSync(marker);
  assert.equal(
    decide().install,
    true,
    'no record means the tree cannot be trusted'
  );

  writeFileSync(
    marker,
    JSON.stringify({ pack: 'analytics', deps: 'stale' }),
    'utf8'
  );
  assert.equal(
    decide().install,
    true,
    'a record for a different dependency set is not this one'
  );
  assert.equal(
    decide({ depsChanged: true }).install,
    true,
    'changed dependencies always install'
  );
  assert.equal(
    decide({ pinned: {} }).install,
    false,
    'a pack that pins nothing has nothing to fetch, whatever else changed'
  );
  assert.equal(
    decide({ dryRun: true }).install,
    false,
    'a dry run installs nothing'
  );
  assert.equal(
    decide({ noInstall: true }).install,
    false,
    '--no-install installs nothing'
  );
});

test('a failed install cannot inherit an earlier success', () => {
  // The transition the marker alone gets wrong: a tree is installed and
  // recorded, node_modules is then lost, and the pack restores the same
  // dependency set. The install runs because the deps changed, but if it fails
  // the *old* marker still describes this exact set - so the next run, where
  // nothing changed any more, reads "already installed" over a broken tree.
  const dir = makeApp();
  const packJson = JSON.parse(
    readFileSync(
      join(dir, '.agents', 'skills', 'analytics', 'pack.json'),
      'utf8'
    )
  );
  const pinned = {
    ...(packJson.dependencies ?? {}),
    ...(packJson.devDependencies ?? {}),
  };
  const decide = (over = {}) =>
    shouldInstallPackDependencies({
      root: dir,
      pack: 'analytics',
      pinned,
      depsChanged: false,
      dryRun: false,
      noInstall: false,
      ...over,
    });

  const marker = join(dir, 'node_modules', '.rayfin-packs', 'analytics.json');
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(
    marker,
    JSON.stringify({ pack: 'analytics', deps: depsFingerprint(pinned) }),
    'utf8'
  );
  assert.equal(
    decide({ depsChanged: true }).install,
    true,
    'restored dependencies install even with a matching marker'
  );

  // What the runner does before handing over to npm.
  clearPackInstall(dir, 'analytics');

  assert.equal(
    existsSync(marker),
    false,
    'the record of the previous tree is gone before npm is trusted to replace it'
  );
  assert.equal(
    decide().install,
    true,
    'after a failed install the next run repairs the tree rather than skipping it'
  );
});

test('a real failed install leaves no record behind', () => {
  // Proves the runner clears the marker rather than just that it can: this
  // drives the actual install path with an npm that fails, which the rest of
  // the suite never does because it always passes --no-install.
  const dir = makeApp();
  const packJson = JSON.parse(
    readFileSync(
      join(dir, '.agents', 'skills', 'analytics', 'pack.json'),
      'utf8'
    )
  );
  const marker = join(dir, 'node_modules', '.rayfin-packs', 'analytics.json');
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(
    marker,
    JSON.stringify({
      pack: 'analytics',
      deps: depsFingerprint({
        ...(packJson.dependencies ?? {}),
        ...(packJson.devDependencies ?? {}),
      }),
    }),
    'utf8'
  );

  const installer = fakeInstaller();
  installer.setBehavior(
    'console.error("npm error code ENOTCACHED"); process.exit(1);'
  );
  const failed = installer.run(dir, 'analytics');
  assert.equal(failed.status, 1, 'the install failed, so the run failed');
  assert.match(failed.stderr, /npm error code ENOTCACHED/u);
  assert.doesNotMatch(failed.stdout, /Pack ready/u);
  assert.equal(
    existsSync(marker),
    false,
    'a failed install must not leave an earlier success behind for the next run to trust'
  );
});

test('an untouched re-apply reports nothing as customized', () => {
  // Every kit file exists after the first apply, so a naive "does it exist?"
  // check calls all of them customized and tells the reader to merge by hand -
  // busywork on files that are byte-for-byte the pack's own.
  const dir = makeApp();
  applyPack(dir);

  const output = applyPack(dir);

  assert.doesNotMatch(
    output,
    /Kept your customized file/u,
    'an unchanged file is not a customization'
  );
});

test('re-applying functions upgrades a client the pack itself planted', () => {
  // The population this matters for: someone who already ran `pack:add functions`
  // from main. Their frontend `rayfin-client.ts` is the *old functions kit*, not
  // the base starter — a different digest from either base revision. If that
  // digest is missing from `seedReplaceIfPristine`, `classifySeed` reads an
  // untouched pack-planted file as a user customization, preserves it, and the
  // same-origin Functions route never lands for exactly the people most likely
  // to have a localhost URL baked into a build.
  const dir = makeApp();
  // `.txt`, not `.ts`: the template ships `scripts/` to customers, and a stale
  // client that predates same-origin routing must not read as source an agent
  // could copy from.
  const priorKit = readFileSync(
    join(
      TEMPLATE,
      'scripts',
      '__fixtures__',
      'functions-kit-rayfin-client.pre-1768.txt'
    ),
    'utf8'
  );

  // Precondition: the fixture really uses the superseded direct URL.
  assert.match(priorKit, /functionsBaseUrl/u);

  const clientPath = join(
    dir,
    'packages',
    'frontend',
    'src',
    'lib',
    'rayfin-client.ts'
  );
  writeFileSync(clientPath, priorKit, 'utf8');
  const output = applyPack(dir, [], 'functions');

  assert.doesNotMatch(
    output,
    /Kept your customized file/u,
    'a file the pack planted itself is not a customization'
  );
  assert.doesNotMatch(
    readFileSync(clientPath, 'utf8'),
    /functionsBaseUrl/u,
    'the upgrade must use the same-origin Functions route'
  );
});

for (const fixture of [
  'visual-validator.pre-1686.txt',
  'visual-validator.pre-1799.txt',
  'visual-validator.pre-1809.txt',
]) {
  test(
    `re-applying visuals upgrades the pristine ${fixture} validator`,
    needsValidatorTooling,
    () => {
      const dir = makeApp();
      applyPack(dir, [], 'visuals');
      linkValidatorTooling(dir);

      const prior = readFileSync(
        join(TEMPLATE, 'scripts', '__fixtures__', fixture),
        'utf8'
      );
      assert.doesNotMatch(
        prior,
        /--allow-incomplete/u,
        'fixture must predate the explicit incomplete-coverage contract'
      );

      const validatorPath = join(dir, 'scripts', 'validate-visual.mjs');
      writeFileSync(validatorPath, prior, 'utf8');
      const chartPath = join(
        dir,
        'packages',
        'frontend',
        'src',
        'UpgradeProbe.tsx'
      );
      writeFileSync(
        chartPath,
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
          'const buildSpec = () => ({ mark: "bar" });\n' +
          'export const UpgradeProbe = () => <VegaVisual spec={buildSpec()} />;\n',
        'utf8'
      );

      const before = runVisualValidator(dir);
      assert.equal(before.exitCode, 0, JSON.stringify(before.report));
      assert.equal(
        before.report.ok,
        true,
        'the historical zero-schema validator must reproduce the false green'
      );

      const output = applyPack(dir, [], 'visuals');
      assert.doesNotMatch(
        output,
        /Kept your customized file/u,
        'an untouched validator planted by an older pack must be upgraded'
      );
      assert.match(readFileSync(validatorPath, 'utf8'), /--allow-incomplete/u);

      const after = runVisualValidator(dir);
      assert.equal(after.exitCode, 1, JSON.stringify(after.report));
      assert.equal(after.report.status, 'incomplete');
      assert.equal(after.report.ok, false);
      assert.equal(after.report.checked.schemasChecked, 0);
      assert.equal(after.report.checked.uncheckedSpecs, 1);
    }
  );
}

test('re-applying visuals preserves a customized historical validator', () => {
  const dir = makeApp();
  applyPack(dir, [], 'visuals');
  const validatorPath = join(dir, 'scripts', 'validate-visual.mjs');
  const prior = readFileSync(
    join(TEMPLATE, 'scripts', '__fixtures__', 'visual-validator.pre-1799.txt'),
    'utf8'
  );
  const customized = `${prior}\n// Builder customization.\n`;
  writeFileSync(validatorPath, customized, 'utf8');

  const output = applyPack(dir, [], 'visuals');
  assert.match(output, /Kept your customized file/u);
  assert.equal(readFileSync(validatorPath, 'utf8'), customized);
});

test('the functions seed keeps the runtime-config contract it replaces', () => {
  // The seed replaces the frontend client wholesale, so everything the baseline
  // exports has to survive the swap. Nothing else in this suite reads the applied
  // client's shape.
  const dir = makeApp();
  applyPack(dir, [], 'functions');

  const client = readFileSync(
    join(dir, 'packages', 'frontend', 'src', 'lib', 'rayfin-client.ts'),
    'utf8'
  );

  assert.match(client, /resolveRayfinConfig/u, 'runtime config must survive');
  assert.match(client, /runtimeConfig: resolved\.runtimeConfig/u);
  assert.doesNotMatch(client, /getRayfinClientSync|bootstrapAuth/u);
  assert.match(
    client,
    /export async function getRayfinClient/u,
    'and it must still be async'
  );
  assert.match(
    client,
    /AppFunctionsSchema/u,
    'while adding the functions type'
  );
  assert.doesNotMatch(
    client,
    /functionsBaseUrl|VITE_RAYFIN_FUNCTIONS_URL/u,
    'the seed must preserve the same-origin Functions route'
  );
});

test('a preconfigured app keeps its settings on a markerless first apply', () => {
  // An app configured by hand has no `rayfinPacks` marker, and `data-modeling`
  // declares no dependencies, so its first apply looks like a fresh one.
  const dir = makeApp();
  const ymlPath = join(dir, 'rayfin', 'rayfin.yml');
  writeFileSync(
    ymlPath,
    'id: universal-app\nservices:\n  data:\n    enabled: true\n    dialect: postgresql\n'
  );

  const pkgPath = join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  delete pkg.rayfinPacks;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  const out = applyPack(dir, [], 'data-modeling');

  const yml = readFileSync(ymlPath, 'utf8');
  assert.match(
    yml,
    /^\s{4}dialect:\s*"?postgresql"?/mu,
    'the choice must survive a first apply'
  );
  assert.doesNotMatch(yml, /dialect:\s*"?mssql"?/u, 'and must not be reset');
  assert.match(
    out,
    /kept your data\.dialect/u,
    'the run should say what it kept'
  );
});

test('placeholder dialects are filled in rather than preserved', () => {
  // Keeping a placeholder is worse than overwriting it: the pack still enables
  // the service, and the host rejects the deploy for the empty value.
  const placeholders = [
    '# TODO',
    'null',
    'NULL',
    '~',
    '""',
    "''",
    'null # TODO',
    '~ # later',
    '"" # unset',
    "'' # unset",
  ];

  for (const placeholder of placeholders) {
    const dir = makeApp();
    const ymlPath = join(dir, 'rayfin', 'rayfin.yml');
    writeFileSync(
      ymlPath,
      `id: universal-app\nservices:\n  data:\n    enabled: true\n    dialect: ${placeholder}\n`
    );

    const out = applyPack(dir, [], 'data-modeling');

    assert.match(
      readFileSync(ymlPath, 'utf8'),
      /^\s{4}dialect:\s*"mssql"/mu,
      `\`dialect: ${placeholder}\` must be replaced with the pack default`
    );
    assert.doesNotMatch(
      out,
      /kept your data\.dialect/u,
      `\`dialect: ${placeholder}\` is not a choice worth reporting as kept`
    );
  }
});

test('a commented real value is still the Builder\u2019s choice', () => {
  // `null#TODO` is the literal string in YAML — `#` only opens a comment after
  // whitespace. Stripping without that guard would collapse it to `null` and
  // overwrite a real value.
  for (const chosen of ['postgresql # chosen', 'null#TODO']) {
    const dir = makeApp();
    const ymlPath = join(dir, 'rayfin', 'rayfin.yml');
    writeFileSync(
      ymlPath,
      `id: universal-app\nservices:\n  data:\n    enabled: true\n    dialect: ${chosen}\n`
    );

    const out = applyPack(dir, [], 'data-modeling');

    assert.match(
      readFileSync(ymlPath, 'utf8'),
      new RegExp(
        `^\\s{4}dialect: ${chosen.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`,
        'mu'
      ),
      `\`dialect: ${chosen}\` must survive untouched`
    );
    assert.match(
      out,
      /kept your data\.dialect/u,
      `\`dialect: ${chosen}\` should be reported as kept`
    );
  }
});

test('every seeded @text field carries an explicit max', () => {
  // `@text()` without `max` becomes NVARCHAR(MAX) on MSSQL, which can break
  // GraphQL schema generation after a deploy that reported success
  // (`rayfin-guide/assets/docs/known-limitations.md`).
  const dir = makeApp();
  applyPack(dir, [], 'data-modeling');

  const entity = readFileSync(
    join(dir, 'packages', 'data', 'src', 'Item.ts'),
    'utf8'
  );
  const unbounded = [...entity.matchAll(/@text\(([^)]*)\)/gu)].filter(
    ([, options]) => !/\bmax\s*:/u.test(options)
  );

  assert.deepEqual(
    unbounded.map(([match]) => match),
    [],
    'every @text in the seeded entity needs a max'
  );
});

test('the owner column crud-ui stamps matches the one the seed policy checks', () => {
  // `data-modeling` and `crud-ui` compose. If the create example stamps a
  // different column than the policy checks, the owner is never set and the
  // policy refuses every row.
  const dir = makeApp();
  applyPack(dir, [], 'data-modeling');

  const entity = readFileSync(
    join(dir, 'packages', 'data', 'src', 'Item.ts'),
    'utf8'
  );
  const ownerColumn = entity.match(/claims\.sub\.eq\(item\.(\w+)\)/u)?.[1];
  assert.ok(ownerColumn, 'the seeded policy should compare an owner column');

  const crudUi = readFileSync(
    join(dir, '.agents', 'skills', 'crud-ui', 'SKILL.md'),
    'utf8'
  );
  const stamped = [...crudUi.matchAll(/(\w+): session\.user\.id/gu)].map(
    ([, name]) => name
  );

  assert.ok(stamped.length > 0, 'crud-ui should show stamping the owner');
  assert.deepEqual(
    [...new Set(stamped)],
    [ownerColumn],
    `crud-ui must stamp \`${ownerColumn}\`, the column the seeded policy checks`
  );
});

test('--force-seeds still takes a preconfigured setting back', () => {
  // Preservation is now unconditional for non-`enabled` properties, so the
  // escape hatch has to keep working — otherwise there is no way to adopt the
  // pack's value once a file already carries one.
  const dir = makeApp();
  const ymlPath = join(dir, 'rayfin', 'rayfin.yml');
  writeFileSync(
    ymlPath,
    'id: universal-app\nservices:\n  data:\n    enabled: true\n    dialect: postgresql\n'
  );

  applyPack(dir, ['--force-seeds'], 'data-modeling');

  assert.match(
    readFileSync(ymlPath, 'utf8'),
    /^\s{4}dialect:\s*"?mssql"?/mu,
    '--force-seeds must overwrite'
  );
});
