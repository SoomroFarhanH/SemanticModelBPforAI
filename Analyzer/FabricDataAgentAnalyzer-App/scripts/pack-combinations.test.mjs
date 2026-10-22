//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

// Packs are authored independently but customers combine them, so a change to
// one pack can break another only once both are applied. `scaffold.integration`
// checks that composed scripts are *spelled* correctly; this file runs the
// contract validator those scripts actually invoke, against real pack sources.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, test as nodeTest } from 'node:test';
import { fileURLToPath } from 'node:url';

const TEMPLATE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VALIDATOR = join(
  TEMPLATE,
  '.agents',
  'skills',
  'functions-capability',
  'kit',
  'scripts',
  'validate-functions.mjs'
);

const tempRoot =
  process.platform === 'win32' && process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'Temp')
    : os.tmpdir();

const TYPESCRIPT_SOURCE = (() => {
  const require = createRequire(import.meta.url);
  for (const candidate of ['typescript-compiler', 'typescript']) {
    try {
      return dirname(require.resolve(`${candidate}/package.json`));
    } catch {
      // Try the next compiler package.
    }
  }
  return undefined;
})();

const test = (name, fn) =>
  nodeTest(
    name,
    {
      skip:
        TYPESCRIPT_SOURCE === undefined
          ? 'TypeScript compiler is not installed in this checkout'
          : false,
    },
    fn
  );

const workspaces = [];
after(() => {
  for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

function makeApp() {
  const dir = realpathSync(mkdtempSync(join(tempRoot, 'pack-combination-')));
  workspaces.push(dir);
  cpSync(TEMPLATE, dir, {
    recursive: true,
    filter: (src) =>
      !/[\\/](node_modules|dist|\.git|\.rayfin)([\\/]|$)/u.test(src) &&
      !/[\\/]\.tsbuildinfo$/u.test(src),
  });
  const nodeModules = join(dir, 'node_modules');
  mkdirSync(nodeModules, { recursive: true });
  symlinkSync(TYPESCRIPT_SOURCE, join(nodeModules, 'typescript'), 'junction');
  return dir;
}

function applyPacks(dir, packs) {
  for (const pack of packs) {
    execFileSync(
      process.execPath,
      [join(dir, 'scripts', 'scaffold.mjs'), pack, '--no-install'],
      { cwd: dir, encoding: 'utf8' }
    );
  }
}

function validateFunctions(dir) {
  const result = spawnSync(process.execPath, [VALIDATOR, '--root', dir], {
    cwd: dir,
    encoding: 'utf8',
  });
  let report = {};
  try {
    report = JSON.parse(result.stdout || '{}');
  } catch {
    // Leave the report empty; the assertion reports the raw output instead.
  }
  return { exitCode: result.status ?? 1, report, raw: result.stdout };
}

// Every combination a customer can reach that includes `functions`, since the
// validator only runs when the functions capability is enabled.
const COMBINATIONS = [
  ['functions'],
  ['analytics', 'functions'],
  ['functions', 'analytics'],
  ['connectors', 'functions'],
  ['data-modeling', 'functions'],
  ['visuals', 'functions'],
  ['analytics', 'connectors', 'data-modeling', 'functions', 'visuals'],
];

for (const packs of COMBINATIONS) {
  test(`the Functions contract holds with ${packs.join(' + ')}`, () => {
    const dir = makeApp();
    applyPacks(dir, packs);

    const { exitCode, report, raw } = validateFunctions(dir);

    assert.equal(
      exitCode,
      0,
      `Functions validation failed for ${packs.join(' + ')}:\n${
        report.failures?.join('\n') || raw
      }`
    );
    assert.deepEqual(report.failures ?? [], []);
  });
}
