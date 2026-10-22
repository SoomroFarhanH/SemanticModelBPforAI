//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

/**
 * `validate:visual`, the capability validator the host plugin requires for any
 * app that renders visuals. It gates deployment, so a change that stops it
 * detecting an unrenderable spec would silently let bad apps ship. Each case
 * builds a throwaway app tree and runs the real script against it with
 * `--root`.
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test as nodeTest } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';

const run = promisify(execFile);
const scripts = path.dirname(fileURLToPath(import.meta.url));

/**
 * These validators are kit files, copied into an app that applied the pack —
 * which is what installs `yaml`. Run from the template source tree there is no
 * parser to resolve, so every case below would fail on the same missing
 * dependency rather than on what it tests. They skip there, and say so rather
 * than reporting green; the manifest and fail-closed cases below cover what they
 * would have proven.
 */
const HAS_YAML = await import('yaml').then(
  () => true,
  () => false
);
const needsYaml = {
  skip: HAS_YAML
    ? false
    : 'the `yaml` package is not resolvable here; these run against an app that applied the pack',
};
/**
 * Every test here needs `yaml`, and some also need the TypeScript compiler, so
 * this forwards an optional second options argument. A wrapper taking only
 * `(name, fn)` binds the body to a discarded third parameter and reports the
 * test as passed without running it.
 */
const test = (name, optionsOrFn, maybeFn) => {
  const fn = maybeFn ?? optionsOrFn;
  const extra = maybeFn === undefined ? undefined : optionsOrFn;
  return nodeTest(name, { skip: needsYaml.skip || (extra?.skip ?? false) }, fn);
};

// Wrapped in CONVERT because that is what a correct currency query looks like -
// Fabric hands back a scaled integer otherwise. Keeping the fixture idiomatic
// means the currency note only fires on the test that is actually about it.
const GOOD_DAX =
  'EVALUATE SUMMARIZECOLUMNS(Products[Region], "Total Revenue", CONVERT([Total Revenue], DOUBLE))';
const GOOD_SPEC = {
  $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
  mark: 'bar',
  encoding: {
    x: { field: 'ProductsRegion', type: 'nominal' },
    y: { field: 'Total Revenue', type: 'quantitative' },
  },
};
const GOOD_FACTORY = [
  'import baseQuery from "./revenue.dax?raw";',
  'import spec from "./revenue.json";',
  'const connection = "salesModel";',
  'export function revenue() { return { connection, query: baseQuery, vegaLiteSpec: spec }; }',
].join('\n');
/**
 * A `rayfin/rayfin.yml` with a semantic model connected, as
 * `rayfin connector add` writes it.
 */
const GOOD_RAYFIN_YAML = [
  'id: test-app',
  'name: Test App',
  'connectors:',
  '  - name: salesModel',
  '    type: fabric-semanticmodel',
  '',
].join('\n');

/**
 * Where a TypeScript the validator can use lives, or undefined.
 *
 * A generated app has `typescript`. This monorepo builds with TypeScript 7,
 * which drops the legacy compiler API, so it keeps a 5.x copy under the
 * `typescript-compiler` alias. Resolution has to be attempted rather than
 * assumed: `resolve` throws, so an unguarded call fails every test in a tree
 * that carries only one of them - or neither, in a pruned install.
 */
const YAML_SOURCE = (() => {
  const require = createRequire(import.meta.url);
  try {
    return path.dirname(require.resolve('yaml/package.json'));
  } catch {
    return undefined;
  }
})();

const TYPESCRIPT_SOURCE = (() => {
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

const REAL_AJV_SOURCE = (() => {
  const require = createRequire(import.meta.url);
  try {
    return path.dirname(require.resolve('ajv/package.json'));
  } catch {
    return undefined;
  }
})();

const REAL_VEGA_LITE_SOURCE = (() => {
  const require = createRequire(import.meta.url);
  try {
    return path.dirname(
      path.dirname(require.resolve('vega-lite/vega-lite-schema.json'))
    );
  } catch {
    return undefined;
  }
})();

/** Reading a spec out of source needs the compiler, so those tests need it too. */
const needsTypeScript = {
  skip:
    TYPESCRIPT_SOURCE === undefined
      ? 'TypeScript is not installed here'
      : false,
};

/** A minimal app tree, with `overrides` replacing any default file. */
async function makeApp(
  overrides = {},
  { linkTypeScript = true, linkYaml = true } = {}
) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'universal-app-validate-'));
  const queries = path.join(
    root,
    'packages',
    'frontend',
    'src',
    'queries',
    'sales'
  );
  await mkdir(queries, { recursive: true });
  // The validator resolves its toolchain from the app being checked, so the temp
  // app needs one linked in to exercise the same path a real app takes.
  //
  // Not best-effort: the destination is a fresh temp tree, and a `junction`
  // needs no elevation on Windows and degrades to an ordinary symlink
  // elsewhere. A throw here is a broken harness, and swallowing it would leave
  // these tests reading an app that is missing the toolchain they assume.
  await mkdir(path.join(root, 'node_modules'), { recursive: true });
  if (YAML_SOURCE !== undefined && linkYaml) {
    await symlink(
      YAML_SOURCE,
      path.join(root, 'node_modules', 'yaml'),
      'junction'
    );
  }
  if (TYPESCRIPT_SOURCE !== undefined && linkTypeScript) {
    await symlink(
      TYPESCRIPT_SOURCE,
      path.join(root, 'node_modules', 'typescript'),
      'junction'
    );
  }
  const files = {
    'rayfin/rayfin.yml': GOOD_RAYFIN_YAML,
    'src/queries/sales/revenue.dax': GOOD_DAX,
    'src/queries/sales/revenue.json': JSON.stringify(GOOD_SPEC),
    'src/queries/sales/revenue.ts': GOOD_FACTORY,
    ...overrides,
  };
  for (const [relative, contents] of Object.entries(files)) {
    if (contents === null) continue;
    const workspaceRelative = relative.startsWith('src/')
      ? path.join('packages', 'frontend', relative)
      : relative;
    const target = path.join(root, workspaceRelative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents, 'utf8');
  }
  return root;
}

/** Runs a validator and returns its parsed report plus exit code. */
async function validate(script, root, extraArgs = []) {
  return validateArgs(script, ['--root', root, ...extraArgs]);
}

async function validateArgs(script, args) {
  try {
    const { stdout } = await run(process.execPath, [
      path.join(scripts, script),
      ...args,
    ]);
    return { exitCode: 0, report: JSON.parse(stdout) };
  } catch (error) {
    return {
      exitCode: error.code ?? 1,
      report: JSON.parse(error.stdout ?? '{}'),
    };
  }
}

async function validateAllowingIncomplete(script, root) {
  return validate(script, root, ['--allow-incomplete']);
}

async function withAppWithoutSchema(overrides, assertions) {
  const root = await makeApp(overrides);
  try {
    await assertions(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function withApp(overrides, assertions) {
  return withSchemaApp(overrides, assertions);
}

/**
 * Runs a validator against an app whose installed `yaml` exports no parser -
 * the shape a pruned or broken install leaves behind. The package is present
 * and resolvable; it just carries nothing usable, which is what the validator
 * distinguishes. Placed in the app's own node_modules because that is where the
 * validator resolves it from.
 */
async function withUnusableYaml(script, assertions) {
  const root = await makeApp({}, { linkYaml: false });
  try {
    const stub = path.join(root, 'node_modules', 'yaml');
    await mkdir(stub, { recursive: true });
    await writeFile(
      path.join(stub, 'package.json'),
      JSON.stringify({ name: 'yaml', version: '0.0.0', main: 'index.js' }),
      'utf8'
    );
    await writeFile(
      path.join(stub, 'index.js'),
      'module.exports = {};\n',
      'utf8'
    );
    await assertions(await validate(script, root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

nodeTest('the pack declares the parser these checks need', async () => {
  // Declaration, not delivery. This asserts the manifest names the parser this
  // script imports; that applying the pack actually writes it into the app is a
  // separate link, covered by `a pack carries its tooling dependencies into the
  // app` in scripts/scaffold.integration.test.mjs. Both halves are needed, and
  // this is the half that can be checked without a parser being resolvable here.
  const manifest = JSON.parse(
    await readFile(path.join(scripts, '..', '..', 'pack.json'), 'utf8')
  );
  const declared = {
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
  };
  assert.ok(
    typeof declared.yaml === 'string' && declared.yaml.length > 0,
    'visuals/pack.json must declare `yaml`, which validate-visual.mjs imports'
  );
  // The schema has to be declared, not left to arrive transitively with the
  // visual packages: a restructure there would silently drop it and leave this
  // script reporting structure-only `ok: true`.
  assert.ok(
    typeof declared['vega-lite'] === 'string' &&
      declared['vega-lite'].length > 0,
    'visuals/pack.json must declare `vega-lite`, the schema these checks compile'
  );
  assert.ok(
    typeof declared.ajv === 'string' && declared.ajv.length > 0,
    'visuals/pack.json must declare `ajv`, which compiles that schema'
  );
  assert.equal(
    manifest.scripts?.['validate:visual'],
    'node scripts/validate-visual.mjs'
  );
  assert.equal(
    manifest.scripts?.['validate:visual:preview'],
    'node scripts/validate-visual.mjs --allow-incomplete'
  );
});

nodeTest('validate:visual rejects a missing --root value', async () => {
  const { exitCode, report } = await validateArgs('validate-visual.mjs', [
    '--root',
    '--allow-incomplete',
  ]);
  assert.equal(exitCode, 1, JSON.stringify(report));
  assert.equal(report.status, 'failed');
  assert.equal(report.coverage, 'none');
  assert.equal(report.ok, false);
  assert.match(report.failures.join(' '), /--root.*requires a directory path/u);
});

nodeTest('validate:visual rejects an unreadable or missing root', async () => {
  const missing = path.join(os.tmpdir(), `missing-visual-root-${Date.now()}`);
  const { exitCode, report } = await validate('validate-visual.mjs', missing, [
    '--allow-incomplete',
  ]);
  assert.equal(exitCode, 1, JSON.stringify(report));
  assert.equal(report.status, 'failed');
  assert.equal(report.coverage, 'none');
  assert.equal(report.ok, false);
  assert.match(report.failures.join(' '), /does not exist or cannot be read/u);
});

nodeTest(
  'validate:visual fails when the yaml parser cannot be loaded',
  async () => {
    // A validator that could not read rayfin.yml cannot say whether inline
    // rows belong there, so it must not exit 0.
    await withUnusableYaml('validate-visual.mjs', ({ exitCode, report }) => {
      assert.equal(exitCode, 1);
      assert.equal(report.status, 'failed');
      assert.equal(report.ok, false);
      assert.match(report.failures.join(' '), /yaml/u);
    });
  }
);

/**
 * Runs the visual validator against an app whose `typescript` carries no
 * compiler API - the shape `loadTypeScript` treats as absent. Real `yaml` is
 * still linked, so the run fails on the compiler and not on the parser.
 */
async function withoutTypeScript(overrides, assertions) {
  const root = await makeApp(overrides, { linkTypeScript: false });
  try {
    const stub = path.join(root, 'node_modules', 'typescript');
    await mkdir(stub, { recursive: true });
    await writeFile(
      path.join(stub, 'package.json'),
      JSON.stringify({
        name: 'typescript',
        version: '0.0.0',
        main: 'index.js',
      }),
      'utf8'
    );
    await writeFile(
      path.join(stub, 'index.js'),
      'module.exports = {};\n',
      'utf8'
    );
    await assertions(await validate('validate-visual.mjs', root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('validate:visual fails when TypeScript cannot be loaded', async () => {
  // Without a compiler no inline spec is read at all, so a chart whose spec is
  // written in source goes unchecked - which must not exit 0. A supported
  // install always has TypeScript, so this state means a broken one.
  await withoutTypeScript(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'const spec = { mark: "bar", encoding: { x: { field: "x", type: "nominal" } } };\n' +
        'export const Chart = () => <VegaVisual spec={spec} />;\n',
    },
    ({ exitCode, report }) => {
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.equal(report.ok, false);
      // Exactly one failure, so a harness that also broke the YAML link cannot
      // pass this on a substring match. Measured: with the link pointed at a
      // missing directory, both of these still passed before the count.
      assert.equal(report.failures.length, 1, JSON.stringify(report));
      assert.match(report.failures.join(' '), /No usable TypeScript compiler/u);
    }
  );
});

test('validate:visual fails without TypeScript even when the visual is aliased', async () => {
  // The reason the check is gated on source existing rather than on the
  // component name appearing: renaming the import at the import site is
  // ordinary code, and only the compiler can follow it. A name-based test
  // reports success here having read none of the app's charts.
  await withoutTypeScript(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual as Chart } from "@microsoft/fabric-visuals";\n' +
        'const spec = { mark: "bar", encoding: { x: { field: "x", type: "nominal" } } };\n' +
        'export const Panel = () => <Chart spec={spec} />;\n',
    },
    ({ exitCode, report }) => {
      // The literal name never appears in this source, so the failure has to be
      // gated on source existing rather than on a `<VegaVisual` scan.
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.equal(report.ok, false);
      assert.equal(report.failures.length, 1, JSON.stringify(report));
      assert.match(report.failures.join(' '), /No usable TypeScript compiler/u);
    }
  );
});

test('validate:visual passes a well-formed spec', async () => {
  await withApp({}, async (root) => {
    const { exitCode, report } = await validate('validate-visual.mjs', root);
    assert.equal(exitCode, 0);
    assert.equal(report.status, 'complete');
    assert.equal(report.coverage, 'complete');
    assert.equal(report.ok, true);
    assert.equal(report.checked.schemasChecked, 1);
    assert.equal(report.checked.uncheckedSpecs, 0);
    assert.deepEqual(report.failures, []);
  });
});

test('validate:visual does not fail a DataGrid app that has no specs', async () => {
  // The visuals capability is selected from words like "table", so a CRUD list
  // or a grid reaches this script with no chart to check. Blocking its
  // deployment over a missing Vega-Lite spec would be wrong.
  await withApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/components/list.tsx':
        'export const List = () => <DataGrid data={rows} />;',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.equal(report.status, 'complete');
      assert.equal(report.coverage, 'complete');
      assert.equal(report.ok, true);
      assert.match(report.notes.join(' '), /DataGrid/u);
    }
  );
});

test(
  'validate:visual leaves a VegaVisual with no usable spec to typecheck',
  needsTypeScript,
  async () => {
    // A spec prop the compiler can judge - missing, bare, or an unresolvable
    // name - belongs to `npm run typecheck`, a required gate that runs before
    // this one. Duplicating it here produced a second, weaker failure for the
    // same defect.
    await withApp(
      {
        'src/queries/sales/revenue.json': null,
        'src/components/chart.tsx':
          'export const C = () => <VegaVisual spec={spec} data={d} />;',
      },
      async (root) => {
        const { exitCode, report } = await validate(
          'validate-visual.mjs',
          root
        );
        assert.equal(exitCode, 0, JSON.stringify(report));
        assert.equal(report.failures.length, 0, JSON.stringify(report));
        assert.match(report.notes.join(' '), /typecheck/u);
      }
    );
  }
);

test('validate:visual ignores VegaVisual shown in a doc comment', async () => {
  await withApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/lib/to-data-table.ts':
        '/**\n * return <VegaVisual spec={s} data={d} />;\n */\nexport const y = 1;',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.equal(report.checked.rendersVegaVisual, false);
    }
  );
});

test('validate:visual ignores a JSON file that is not a chart spec', async () => {
  // Not every JSON under src/queries is a spec. A lookup table or column map
  // would otherwise be reported as a chart that renders no mark.
  await withApp(
    {
      'src/queries/sales/regions.json': JSON.stringify({
        north: 'N',
        south: 'S',
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.equal(report.checked.specs, 1);
    }
  );
});

test('validate:visual reads a spec a factory imports even without a $schema', async () => {
  // The other half of the rule above. A spec that omits `$schema` is still a
  // spec if a query factory imports it as one, so it has to be recognised and
  // checked - otherwise the only signal is the note about the missing $schema,
  // which cannot fire on a file that was never treated as a chart.
  await withApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/chart.json': JSON.stringify({ layer: [] }),
      'src/queries/sales/revenue.ts':
        'import spec from "./chart.json";\nexport const query = () => spec;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.match(
        report.failures.join(' '),
        /chart\.json resolves to no mark/u
      );
    }
  );
});

test(
  'validate:visual fails when a source file cannot be read',
  // Denying read needs a real ACL: `chmod` on Windows only toggles read-only,
  // which does not block a read. Skipped at registration elsewhere, so it is
  // reported as skipped rather than as a pass that asserted nothing.
  { skip: process.platform === 'win32' ? false : 'needs Windows ACLs' },
  async (t) => {
    // `walk` has already established this is a file, so a read failure is a
    // permission, lock or race. Substituting empty source would hide every
    // chart in it behind a green report.
    await withApp(
      {
        'src/queries/sales/revenue.json': null,
        'src/components/Chart.tsx':
          'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
          'const spec = { mark: "bar" };\n' +
          'export const Chart = () => <VegaVisual spec={spec} />;\n',
      },
      async (root) => {
        const target = path.join(
          root,
          'packages',
          'frontend',
          'src',
          'components',
          'Chart.tsx'
        );
        const who = os.userInfo().username;
        try {
          await run('icacls', [target, '/deny', `${who}:(R)`]);
        } catch {
          t.skip('icacls is not available here');
          return;
        }
        try {
          const { exitCode, report } = await validate(
            'validate-visual.mjs',
            root
          );
          assert.equal(exitCode, 1, JSON.stringify(report));
          assert.match(
            report.failures.join(' '),
            /Chart\.tsx could not be read/u
          );
        } finally {
          await run('icacls', [target, '/remove:d', who]).catch(
            () => undefined
          );
        }
      }
    );
  }
);

test(
  'validate:visual fails when a .json spec cannot be read',
  { skip: process.platform === 'win32' ? false : 'needs Windows ACLs' },
  async (t) => {
    // The other half of the rule above. An unreadable spec file is dropped from
    // `specFiles`, so without a failure here it leaves no trace at all.
    await withApp(
      {
        'src/queries/sales/revenue.json': JSON.stringify({
          $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
          mark: 'bar',
        }),
      },
      async (root) => {
        const target = path.join(
          root,
          'packages',
          'frontend',
          'src',
          'queries',
          'sales',
          'revenue.json'
        );
        const who = os.userInfo().username;
        try {
          await run('icacls', [target, '/deny', `${who}:(R)`]);
        } catch {
          t.skip('icacls is not available here');
          return;
        }
        try {
          const { exitCode, report } = await validate(
            'validate-visual.mjs',
            root
          );
          assert.equal(exitCode, 1, JSON.stringify(report));
          assert.match(
            report.failures.join(' '),
            /revenue\.json could not be read/u
          );
        } finally {
          await run('icacls', [target, '/remove:d', who]).catch(
            () => undefined
          );
        }
      }
    );
  }
);

test(
  'validate:visual fails when a source directory cannot be listed',
  { skip: process.platform === 'win32' ? false : 'needs Windows ACLs' },
  async (t) => {
    // An unreadable directory must not read as an empty one, or every file
    // below it disappears behind a green report. Only ENOENT is ordinary - not
    // every app has src/queries.
    await withApp(
      {
        'src/queries/sales/revenue.json': null,
        'src/components/Chart.tsx':
          'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
          'const spec = { mark: "bar" };\n' +
          'export const Chart = () => <VegaVisual spec={spec} />;\n',
      },
      async (root) => {
        const target = path.join(
          root,
          'packages',
          'frontend',
          'src',
          'components'
        );
        const who = os.userInfo().username;
        try {
          await run('icacls', [target, '/deny', `${who}:(RX)`]);
        } catch {
          t.skip('icacls is not available here');
          return;
        }
        try {
          const { exitCode, report } = await validate(
            'validate-visual.mjs',
            root
          );
          assert.equal(exitCode, 1, JSON.stringify(report));
          assert.match(
            report.failures.join(' '),
            /components could not be listed/u
          );
        } finally {
          await run('icacls', [target, '/remove:d', who]).catch(
            () => undefined
          );
        }
      }
    );
  }
);

test('validate:visual rejects a selection param at the top of a layered spec', async () => {
  // The failure this exists to prevent: Vega-Lite compiles a top-level selection
  // into every layer, the duplicate signal names throw at render, and the card
  // shows a stack trace where the chart should be. Seen in a real deployed app.
  await withApp(
    {
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        params: [
          {
            name: 'regionSelection',
            select: { type: 'point', fields: ['Region'] },
          },
        ],
        encoding: { x: { field: 'Region', type: 'nominal' } },
        layer: [{ mark: 'bar' }, { mark: 'text' }],
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1);
      assert.match(
        report.failures.join(' '),
        /selection param\(s\) regionSelection/u
      );
    }
  );
});

test('validate:visual accepts a selection inside the layer that owns it', async () => {
  await withApp(
    {
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        encoding: { x: { field: 'Region', type: 'nominal' } },
        layer: [
          {
            mark: 'bar',
            params: [
              {
                name: 'regionSelection',
                select: { type: 'point', fields: ['Region'] },
              },
            ],
          },
          { mark: 'text' },
        ],
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
    }
  );
});

test('validate:visual accepts a selection on a unit spec', async () => {
  await withApp(
    {
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        params: [
          { name: 'sel', select: { type: 'point', fields: ['Region'] } },
        ],
        mark: 'bar',
        encoding: { x: { field: 'Region', type: 'nominal' } },
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
    }
  );
});

test('validate:visual accepts a top-level selection scoped with views', async () => {
  // Vega-Lite's own escape hatch: "If this property is specified, selections
  // will only be applied to views with the given names." Scoping to one child
  // materializes the signal once, so the duplicate-signal crash cannot happen
  // and the spec must not be blocked.
  await withApp(
    {
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        params: [
          {
            name: 'regionSelection',
            select: { type: 'point', fields: ['Region'] },
            views: ['bars'],
          },
        ],
        encoding: { x: { field: 'Region', type: 'nominal' } },
        layer: [{ name: 'bars', mark: 'bar' }, { mark: 'text' }],
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
    }
  );
});

test('validate:visual still rejects a top-level selection with an empty views list', async () => {
  // An empty list scopes nothing, so the default applies and every branch gets
  // the signal - the crash is back.
  await withApp(
    {
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        params: [
          {
            name: 'regionSelection',
            select: { type: 'point', fields: ['Region'] },
            views: [],
          },
        ],
        encoding: { x: { field: 'Region', type: 'nominal' } },
        layer: [{ mark: 'bar' }, { mark: 'text' }],
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1);
      assert.match(
        report.failures.join(' '),
        /selection param\(s\) regionSelection/u
      );
    }
  );
});

test('validate:visual leaves a non-selection param alone', async () => {
  await withApp(
    {
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        params: [{ name: 'threshold', value: 10 }],
        encoding: { x: { field: 'Region', type: 'nominal' } },
        layer: [{ mark: 'bar' }],
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
    }
  );
});
test('validate:visual leaves a selection alone on a single-child layer', async () => {
  // With one entry there is only one branch to compile the param into, so no
  // signal name repeats and the chart parses clean. Failing it would block a
  // legal spec.
  await withApp(
    {
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        params: [
          { name: 'pick', select: { type: 'point', fields: ['Region'] } },
        ],
        encoding: { x: { field: 'Region', type: 'nominal' } },
        layer: [{ mark: 'bar' }],
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
    }
  );
});

test('validate:visual leaves a single-child layer alone with an empty views list', async () => {
  // `views: []` scopes nothing, so it is equivalent to omitting it: a failure on
  // a multi-child layer, clean here.
  await withApp(
    {
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        params: [
          {
            name: 'pick',
            select: { type: 'point', fields: ['Region'] },
            views: [],
          },
        ],
        encoding: { x: { field: 'Region', type: 'nominal' } },
        layer: [{ mark: 'bar' }],
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
    }
  );
});

test('validate:visual leaves a top-level selection alone on non-layer composites', async () => {
  // Only `layer` duplicates the signal. Each of these compiles, parses and
  // renders clean with the identical unscoped param, so failing them would
  // block legal specs.
  for (const composite of [
    { concat: [{ mark: 'bar' }, { mark: 'point' }] },
    { hconcat: [{ mark: 'bar' }, { mark: 'point' }] },
    { vconcat: [{ mark: 'bar' }, { mark: 'point' }] },
    { facet: { field: 'Region', type: 'nominal' }, spec: { mark: 'bar' } },
    {
      repeat: ['Revenue', 'Units'],
      spec: { mark: 'bar', encoding: { y: { field: { repeat: 'repeat' } } } },
    },
  ]) {
    await withApp(
      {
        'src/queries/sales/revenue.json': JSON.stringify({
          $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
          params: [
            { name: 'pick', select: { type: 'point', fields: ['Region'] } },
          ],
          ...composite,
        }),
      },
      async (root) => {
        const { exitCode, report } = await validate(
          'validate-visual.mjs',
          root
        );
        assert.equal(
          exitCode,
          0,
          Object.keys(composite)[0] + ': ' + JSON.stringify(report)
        );
      }
    );
  }
});

/**
 * Seeds an app with a real JSON-schema validator and a schema at the path
 * validate:visual looks for.
 *
 * The schema is deliberately small rather than Vega-Lite's 1.8 MB original: what
 * needs testing is our plumbing - that the schema is found, compiled, that the
 * DataTable is injected before validating, and that the reported error names the
 * property that is actually wrong. Vega-Lite's own schema being correct is not
 * ours to prove. `ajv` is copied from this repo so the validator under test is
 * the real one.
 */
async function withSchemaApp(overrides, assertions) {
  // Resolved through Node rather than by counting directories up: this file is
  // copied into a generated app's scripts/, where a relative hop out of the repo
  // tree would land nowhere.
  //
  // Unguarded on purpose. The copilot-plugin package declares `ajv` as a
  // devDependency so these assertions cannot disappear; skipping instead would
  // report green having checked nothing. The Vega-Lite schema itself is not
  // needed here - the stub below stands in for it.
  const ajvSource = path.dirname(
    createRequire(import.meta.url).resolve('ajv/package.json')
  );
  const root = await makeApp({
    // The real package publishes an `exports` map whose only schema entry is the
    // short specifier, so the `build/...` path it actually lives at throws
    // ERR_PACKAGE_PATH_NOT_EXPORTED. Mirrored here: without it the stub is a
    // bare folder where any subpath resolves, and a validator asking for the
    // wrong specifier would still pass every schema test.
    'node_modules/vega-lite/package.json': JSON.stringify({
      name: 'vega-lite',
      version: '6.4.3',
      exports: {
        './vega-lite-schema.json': './build/vega-lite-schema.json',
      },
    }),
    // Mirrors the two things about the real schema that matter here: `data` is
    // required (so a spec that is not given one fails), and encoding types are a
    // closed set (so a typo is caught).
    'node_modules/vega-lite/build/vega-lite-schema.json': JSON.stringify({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['data'],
      properties: {
        // `values` is constrained because a spec that authors its own rows is
        // validated as written rather than having a stand-in injected, and that
        // is what the authored-data test turns on.
        data: {
          type: 'object',
          properties: { values: { type: 'array' } },
        },
        // `anyOf` mirrors the real schema, where a mark is a name or a config
        // object. The opacity bound is the case the TypeScript types do not
        // cover, so the stub has to model it for that test to mean anything.
        mark: {
          anyOf: [
            { type: 'string' },
            {
              type: 'object',
              properties: {
                type: { type: 'string' },
                opacity: { type: 'number', minimum: 0, maximum: 1 },
              },
            },
          ],
        },
        encoding: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              type: {
                enum: ['nominal', 'ordinal', 'quantitative', 'temporal'],
              },
            },
          },
        },
      },
    }),
    ...overrides,
  });
  try {
    // ajv and the packages it requires at runtime. Copying only `ajv` leaves
    // `dist/ajv.js` unable to resolve `fast-deep-equal`, so the app-root import
    // fails and the check quietly falls back to whatever ajv sits beside this
    // file - which means these assertions were never exercising the path a real
    // app takes. Read from the manifest rather than hard-coded so a version
    // bump cannot silently reintroduce that, and resolved from ajv's own
    // location because that is where its dependencies are installed.
    const manifest = JSON.parse(
      await readFile(path.join(ajvSource, 'package.json'), 'utf8')
    );
    const fromAjv = createRequire(path.join(ajvSource, 'package.json'));
    const packages = [
      ['ajv', ajvSource],
      ...Object.keys(manifest.dependencies ?? {}).map((name) => [
        name,
        path.dirname(fromAjv.resolve(`${name}/package.json`)),
      ]),
    ];
    for (const [name, source] of packages) {
      await cp(source, path.join(root, 'node_modules', name), {
        recursive: true,
      });
    }
    await assertions(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function withRealSchemaApp(overrides, assertions) {
  const root = await makeApp(overrides);
  try {
    const manifest = JSON.parse(
      await readFile(path.join(REAL_AJV_SOURCE, 'package.json'), 'utf8')
    );
    const fromAjv = createRequire(path.join(REAL_AJV_SOURCE, 'package.json'));
    const packages = [
      ['ajv', REAL_AJV_SOURCE],
      ...Object.keys(manifest.dependencies ?? {}).map((name) => [
        name,
        path.dirname(fromAjv.resolve(`${name}/package.json`)),
      ]),
    ];
    for (const [name, source] of packages) {
      await cp(source, path.join(root, 'node_modules', name), {
        recursive: true,
      });
    }
    await cp(
      REAL_VEGA_LITE_SOURCE,
      path.join(root, 'node_modules', 'vega-lite'),
      { recursive: true }
    );
    await assertions(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

nodeTest(
  'validate:visual compiles the real pinned Vega-Lite schema',
  {
    skip:
      REAL_AJV_SOURCE === undefined || REAL_VEGA_LITE_SOURCE === undefined
        ? 'the real AJV and Vega-Lite packages are not installed here'
        : false,
  },
  async () => {
    await withRealSchemaApp({}, async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.equal(report.status, 'complete');
      assert.equal(report.coverage, 'complete');
      assert.equal(report.ok, true);
      assert.equal(report.checked.schemasChecked, 1);
    });
  }
);

test('validate:visual validates specs against the Vega-Lite schema when it is installed', async () => {
  // The failure this catches: a typo in a closed vocabulary. "nominl" is not a
  // Vega-Lite encoding type, the chart renders nothing, and every hand-written
  // rule in this script passes it - it has a mark, an encoding, and no inline
  // data.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        mark: 'bar',
        encoding: { x: { field: 'Region', type: 'nominl' } },
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1);
      const text = report.failures.join(' ');
      assert.match(text, /Vega-Lite schema/u);
      // The message has to name the property, or it is not actionable.
      assert.match(text, /encoding.*x.*type/u);
    }
  );
});

test('validate:visual supplies the DataTable before validating a spec', async () => {
  // Specs never carry their own data - <VegaVisual> passes it at runtime, and
  // this script fails a spec that hard-codes `data.values`. The schema requires
  // `data`, so validating a spec exactly as authored would fail every correct
  // spec in every app. This is the guard for that.
  await withSchemaApp({}, async (root) => {
    const { exitCode, report } = await validate('validate-visual.mjs', root);
    assert.equal(exitCode, 0, JSON.stringify(report));
    assert.doesNotMatch(
      report.notes.join(' '),
      /not validated against the official schema/u
    );
  });
});

test('validate:visual fails when the schema tooling is not installed', async () => {
  // Hand-written checks still run, but a broken install is not an incomplete
  // authoring state and the preview flag must never bypass it.
  await withAppWithoutSchema({}, async (root) => {
    const result = await validate('validate-visual.mjs', root);
    assert.equal(result.exitCode, 1, JSON.stringify(result.report));
    assert.equal(result.report.status, 'failed');
    assert.equal(result.report.coverage, 'none');
    assert.equal(result.report.ok, false);
    assert.match(
      result.report.failures.join(' '),
      /cannot resolve `vega-lite\/vega-lite-schema\.json`/u
    );
    const preview = await validate('validate-visual.mjs', root, [
      '--allow-incomplete',
    ]);
    assert.equal(preview.exitCode, 1, JSON.stringify(preview.report));
    assert.equal(preview.report.status, 'failed');
    assert.equal(preview.report.coverage, 'none');
    assert.equal(preview.report.ok, false);
  });
});

test('validate:visual preserves an installed schema parse failure', async () => {
  await withSchemaApp(
    {
      'node_modules/vega-lite/build/vega-lite-schema.json': '{ not json',
    },
    async (root) => {
      const result = await validate('validate-visual.mjs', root, [
        '--allow-incomplete',
      ]);
      assert.equal(result.exitCode, 1, JSON.stringify(result.report));
      assert.equal(result.report.status, 'failed');
      assert.equal(result.report.coverage, 'none');
      assert.match(
        result.report.failures.join(' '),
        /installed Vega-Lite schema is not valid JSON/u
      );
      assert.match(result.report.failures.join(' '), /position|property/iu);
    }
  );
});
test('validate:visual rejects a spec that renders no mark', async () => {
  await withApp(
    {
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: GOOD_SPEC.$schema,
        encoding: GOOD_SPEC.encoding,
      }),
    },
    async (root) => {
      const result = await validate('validate-visual.mjs', root);
      assert.equal(result.exitCode, 1);
      assert.equal(result.report.status, 'failed');
      assert.equal(result.report.coverage, 'complete');
      assert.equal(result.report.ok, false);
      assert.match(result.report.failures.join(' '), /no mark/u);
      const preview = await validate('validate-visual.mjs', root, [
        '--allow-incomplete',
      ]);
      assert.equal(preview.exitCode, 1, JSON.stringify(preview.report));
      assert.equal(preview.report.status, 'failed');
      assert.equal(preview.report.coverage, 'complete');
      assert.equal(preview.report.ok, false);
    }
  );
});

test('validate:visual fails a model-backed spec that hard-codes its own rows', async () => {
  // The rows the chart draws, in an app connected to a model: it builds,
  // deploys and looks right while showing something other than the model, so
  // this is worth blocking rather than reporting.
  await withApp(
    {
      'src/queries/sales/revenue.json': JSON.stringify({
        ...GOOD_SPEC,
        data: { values: [{ a: 1 }] },
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.match(report.failures.join(' '), /hard-codes the rows it draws/u);
    }
  );
});

test('validate:visual accepts a layered spec with no top-level mark', async () => {
  await withApp(
    {
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: GOOD_SPEC.$schema,
        layer: [{ mark: 'line', encoding: GOOD_SPEC.encoding }],
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.equal(report.ok, true);
    }
  );
});

test('validate:visual allows inline data in an app with no semantic model', async () => {
  // The visuals skill documents `data: { values: [...] }` for static and sample
  // data. Failing it made the sample-data path impossible to validate: the skill
  // said do this, the required validator said never.
  await withApp(
    {
      'rayfin/rayfin.yml': null,
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        data: { values: [{ region: 'North', revenue: 10 }] },
        mark: 'bar',
        encoding: {
          x: { field: 'region', type: 'nominal' },
          y: { field: 'revenue', type: 'quantitative' },
        },
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.match(report.notes.join(' '), /label it as sample data/u);
    }
  );
});

test('validate:visual notes authored rows on a child layer, and does not fail them', async () => {
  // The threshold case. Static rows beside the model's data are ordinary
  // Vega-Lite, so this stays a note the reader judges.
  await withApp(
    {
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        layer: [
          {
            mark: 'bar',
            encoding: {
              x: { field: 'region', type: 'nominal' },
              y: { field: 'revenue', type: 'quantitative' },
            },
          },
          {
            mark: 'rule',
            data: { values: [{ target: 500 }] },
            encoding: { y: { field: 'target', type: 'quantitative' } },
          },
        ],
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.match(report.notes.join(' '), /connected to a semantic model/u);
    }
  );
});

// Verbatim `yaml` output for a connectors list written into the shipped
// template. The writer can emit a flow mapping per entry rather than the block
// style the other tests use, and a hand-edited file can keep an entry on one
// line. Both are connections and neither is block style.
const WRITER_RAYFIN_YAML = [
  'id: test-app',
  'connectors:',
  '  - {',
  '      name: salesModel,',
  '      type: fabric-semanticmodel',
  '    }',
  '',
].join('\n');

test('validate:visual reads a connection the writer wrote in flow style', async () => {
  await withApp(
    {
      'rayfin/rayfin.yml': WRITER_RAYFIN_YAML,
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        data: { values: [{ region: 'North', revenue: 10 }] },
        mark: 'bar',
        encoding: {
          x: { field: 'region', type: 'nominal' },
          y: { field: 'revenue', type: 'quantitative' },
        },
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.match(report.failures.join(' '), /connected to a semantic model/u);
    }
  );
});

test('validate:visual reads a connection left on one line', async () => {
  await withApp(
    {
      'rayfin/rayfin.yml': [
        'id: test-app',
        'connectors: [{ name: salesModel, type: fabric-semanticmodel }]',
        '',
      ].join('\n'),
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        data: { values: [{ region: 'North', revenue: 10 }] },
        mark: 'bar',
        encoding: {
          x: { field: 'region', type: 'nominal' },
          y: { field: 'revenue', type: 'quantitative' },
        },
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.match(report.failures.join(' '), /connected to a semantic model/u);
    }
  );
});

test('validate:visual does not read an empty connectors list as a connection', async () => {
  await withApp(
    {
      'rayfin/rayfin.yml': ['id: test-app', 'connectors: []', ''].join('\n'),
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        data: { values: [{ region: 'North', revenue: 10 }] },
        mark: 'bar',
        encoding: {
          x: { field: 'region', type: 'nominal' },
          y: { field: 'revenue', type: 'quantitative' },
        },
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.match(report.notes.join(' '), /label it as sample data/u);
    }
  );
});

test('validate:visual reads only a semantic model connector', async () => {
  // A SQL connector is a real source, but not the one the inline-data rule is
  // about. Treating it as one would fail a chart for reading data this
  // validator cannot see.
  await withApp(
    {
      'rayfin/rayfin.yml': [
        'id: test-app',
        'connectors:',
        '  - name: inventory',
        '    type: fabric-warehouse',
        '',
      ].join('\n'),
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        data: { values: [{ region: 'North', revenue: 10 }] },
        mark: 'bar',
        encoding: {
          x: { field: 'region', type: 'nominal' },
          y: { field: 'revenue', type: 'quantitative' },
        },
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.match(report.notes.join(' '), /label it as sample data/u);
    }
  );
});

test('validate:visual finds a model connector behind another kind', async () => {
  // The mirror of the case above. A reader that stopped at the first entry
  // would stay quiet about a chart quietly showing something other than the
  // model.
  await withApp(
    {
      'rayfin/rayfin.yml': [
        'id: test-app',
        'connectors:',
        '  - name: inventory',
        '    type: fabric-warehouse',
        '  - name: salesModel',
        '    type: fabric-semanticmodel',
        '',
      ].join('\n'),
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        data: { values: [{ region: 'North', revenue: 10 }] },
        mark: 'bar',
        encoding: {
          x: { field: 'region', type: 'nominal' },
          y: { field: 'revenue', type: 'quantitative' },
        },
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.match(report.failures.join(' '), /connected to a semantic model/u);
    }
  );
});

test('validate:visual does not call inline rows sample data when connectors is unusable', async () => {
  // A model may well be connected here — the file just does not say, because
  // `connectors` is neither a list nor a map. The sample-data note would be a
  // guess, so this only has to avoid asserting the wrong thing.
  await withApp(
    {
      'rayfin/rayfin.yml': [
        'id: test-app',
        'connectors: fabric-semanticmodel',
        '',
      ].join('\n'),
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        data: { values: [{ region: 'North', revenue: 10 }] },
        mark: 'bar',
        encoding: {
          x: { field: 'region', type: 'nominal' },
          y: { field: 'revenue', type: 'quantitative' },
        },
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
      const notes = report.notes.join(' ');
      assert.match(notes, /neither a list nor a map/u);
      assert.doesNotMatch(notes, /label it as sample data/u);
    }
  );
});

test('validate:visual reads the legacy map and connector: shapes the CLI still accepts', async () => {
  // `normalizeConnectorsBlock` lifts a map key to `name` and renames a per-entry
  // `connector:` to `type:`. A reader that only handled the modern list would
  // class these apps as disconnected and stop failing hard-coded model rows.
  for (const yml of [
    [
      'id: test-app',
      'connectors:',
      '  salesModel:',
      '    type: fabric-semanticmodel',
      '',
    ],
    [
      'id: test-app',
      'connectors:',
      '  - name: salesModel',
      '    connector: fabric-semanticmodel',
      '',
    ],
  ]) {
    await withApp(
      {
        'rayfin/rayfin.yml': yml.join('\n'),
        'src/queries/sales/revenue.json': JSON.stringify({
          $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
          data: { values: [{ region: 'North', revenue: 10 }] },
          mark: 'bar',
          encoding: {
            x: { field: 'region', type: 'nominal' },
            y: { field: 'revenue', type: 'quantitative' },
          },
        }),
      },
      async (root) => {
        const { exitCode, report } = await validate(
          'validate-visual.mjs',
          root
        );
        assert.equal(exitCode, 1, JSON.stringify(report));
        assert.match(
          report.failures.join(' '),
          /connected to a semantic model/u
        );
      }
    );
  }
});

test('validate:visual still calls inline rows sample data with no rayfin.yml', async () => {
  // The missing-file case is a sample-data app, not a broken config.
  await withApp(
    {
      'rayfin/rayfin.yml': null,
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        data: { values: [{ region: 'North', revenue: 10 }] },
        mark: 'bar',
        encoding: {
          x: { field: 'region', type: 'nominal' },
          y: { field: 'revenue', type: 'quantitative' },
        },
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.match(report.notes.join(' '), /label it as sample data/u);
    }
  );
});

test('validate:visual reads a connection past a trailing comment', async () => {
  // A comment after `connectors:` used to hide the connection, which turned the
  // model-backed note about authored rows into a sample-data one.
  await withApp(
    {
      'rayfin/rayfin.yml': [
        'id: test-app',
        'connectors: # data sources',
        '  - name: salesModel # the model',
        '    type: fabric-semanticmodel',
        '',
      ].join('\n'),
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        data: { values: [{ region: 'North', revenue: 10 }] },
        mark: 'bar',
        encoding: {
          x: { field: 'region', type: 'nominal' },
          y: { field: 'revenue', type: 'quantitative' },
        },
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.match(report.failures.join(' '), /connected to a semantic model/u);
    }
  );
});

test('validate:visual fails a concatenated panel that hard-codes its own bars', async () => {
  // A concat child is an independent chart, not an annotation over the one
  // above it. Treating every composite child as a layer let a model-backed
  // panel draw invented numbers and still exit 0.
  for (const key of ['concat', 'hconcat', 'vconcat']) {
    await withApp(
      {
        'src/queries/sales/revenue.json': JSON.stringify({
          $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
          [key]: [
            {
              data: { values: [{ region: 'North', revenue: 10 }] },
              mark: 'bar',
              encoding: {
                x: { field: 'region', type: 'nominal' },
                y: { field: 'revenue', type: 'quantitative' },
              },
            },
          ],
        }),
      },
      async (root) => {
        const { exitCode, report } = await validate(
          'validate-visual.mjs',
          root
        );
        assert.equal(exitCode, 1, `${key}: ${JSON.stringify(report)}`);
        assert.match(
          report.failures.join(' '),
          /hard-codes the rows it draws/u
        );
      }
    );
  }
});

test('validate:visual sees a root named dataset a nested panel draws', async () => {
  // `datasets` is top-level only, so a name declared at the root can be
  // consumed by a panel any number of levels down. The named spelling has to
  // behave exactly like the inline one at every depth, or hiding rows behind a
  // name is a way around the check.
  await withApp(
    {
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        datasets: { hardcoded: [{ region: 'North', revenue: 10 }] },
        vconcat: [
          {
            layer: [
              {
                data: { name: 'hardcoded' },
                mark: 'bar',
                encoding: { x: { field: 'region', type: 'nominal' } },
              },
            ],
          },
        ],
      }),
    },
    async (root) => {
      const { report } = await validate('validate-visual.mjs', root);
      assert.match(
        report.notes.join(' '),
        /authors its own rows/u,
        `a nested named dataset must be reported: ${JSON.stringify(report)}`
      );
    }
  );
});

test('validate:visual fails a facet panel that hard-codes its own rows', async () => {
  // `facet` and `repeat` repeat one chart across values; the repeated chart is
  // the app's data, not an annotation.
  await withApp(
    {
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        facet: { field: 'category', type: 'nominal' },
        spec: {
          data: { values: [{ region: 'North', revenue: 10 }] },
          mark: 'bar',
          encoding: { x: { field: 'region', type: 'nominal' } },
        },
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.match(report.failures.join(' '), /hard-codes the rows it draws/u);
    }
  );
});

test('validate:visual notes an annotation layer inside a concatenated panel', async () => {
  // The exception still applies one level down: a rule layer over a panel's
  // bars is a threshold, wherever that panel sits.
  await withApp(
    {
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        hconcat: [
          {
            layer: [
              {
                mark: 'bar',
                encoding: {
                  x: { field: 'region', type: 'nominal' },
                  y: { field: 'revenue', type: 'quantitative' },
                },
              },
              {
                mark: 'rule',
                data: { values: [{ target: 500 }] },
                encoding: { y: { field: 'target', type: 'quantitative' } },
              },
            ],
          },
        ],
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.match(report.notes.join(' '), /connected to a semantic model/u);
    }
  );
});

test(
  'validate:visual accepts a spec written inline in source',
  needsTypeScript,
  async () => {
    // The visuals skill documents an inline spec object for static and sample
    // data. Demanding a .json file failed apps that followed the guidance exactly.
    await withApp(
      {
        'src/queries/sales/revenue.json': null,
        'src/queries/sales/revenue.ts': null,
        'src/components/Chart.tsx':
          'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
          'const spec = { mark: "bar",' +
          ' encoding: { x: { field: "x", type: "quantitative" } } };\n' +
          'export const Chart = () => <VegaVisual spec={spec} />;\n',
      },
      async (root) => {
        const { exitCode, report } = await validate(
          'validate-visual.mjs',
          root
        );
        assert.equal(exitCode, 0, JSON.stringify(report));
        // Counted and checked, not waved through: a static literal is read and
        // put through the same rules as a .json spec. This fixture connects a
        // model, so it must not carry inline data - the rule that proves the
        // chart shows the model's numbers applies to inline specs too.
        assert.equal(report.checked.inlineSpecs, 1, JSON.stringify(report));
        assert.equal(
          report.checked.inlineSpecsUnchecked,
          0,
          JSON.stringify(report)
        );
      }
    );
  }
);

test('validate:visual accepts a spec written as a JSON string', async () => {
  // `VegaVisualProps.spec` is `VisualizationSpec | string`, so a JSON string is a
  // supported spelling and must not be rejected outright.
  //
  // `withSchemaApp` rather than `withApp`: the point is that a parsed string
  // reaches the same official Vega-Lite schema check an object spec does. The
  // note assertion is what proves that - exit code and `inlineSpecs` alone stay
  // green even when no validator resolves and nothing was schema-checked.
  //
  // Both spellings are covered because they take different branches: a JSX
  // string attribute never becomes an expression, while an identifier is
  // resolved first.
  const spec =
    '{"data":{"name":"rows"},"mark":"bar","encoding":{"x":{"field":"x","type":"nominal"}}}';
  for (const [label, source] of [
    [
      'identifier',
      `const s = '${spec}';\nexport const C = () => <VegaVisual spec={s} />;\n`,
    ],
    [
      'jsx attribute',
      `export const C = () => <VegaVisual spec='${spec}' />;\n`,
    ],
  ]) {
    await withSchemaApp(
      {
        'src/queries/sales/revenue.json': null,
        'src/queries/sales/revenue.ts': null,
        'src/components/Chart.tsx':
          'import { VegaVisual } from "@microsoft/fabric-visuals";\n' + source,
      },
      async (root) => {
        const { exitCode, report } = await validate(
          'validate-visual.mjs',
          root
        );
        assert.equal(exitCode, 0, `${label}: ${JSON.stringify(report)}`);
        assert.equal(
          report.checked.inlineSpecs,
          1,
          `${label}: ${JSON.stringify(report)}`
        );
        assert.ok(
          !report.notes.join(' ').includes('official schema'),
          `${label}: schema never ran - ${JSON.stringify(report)}`
        );
      }
    );
  }
});

test('validate:visual schema-checks a spec written as a JSON string', async () => {
  // The strongest proof that a parsed string joins the normal path: a typo
  // only the schema can catch has to fail, exactly as it does for an object.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'const s = \'{"data":{"name":"rows"},"mark":"bar","encoding":{"x":{"field":"x","type":"nominl"}}}\';\n' +
        'export const C = () => <VegaVisual spec={s} />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      // Path spelling varies by ajv version; see the object-spec test above.
      assert.match(report.failures.join(' '), /encoding.{0,5}x.{0,5}type/u);
    }
  );
});

test('validate:visual rejects string specs that are not spec objects', async () => {
  // JSON that parses to something other than an object draws nothing, and text
  // that is not JSON at all never reaches Vega's parse. Each row pins its own
  // verdict, because exit code alone cannot tell `missing` from `invalid`.
  for (const [label, text, expected] of [
    ['empty object', '{}', /empty spec/u],
    ['json array', '[]', /is passed "\[\]" as its spec/u],
    ['json null', 'null', /is passed "null" as its spec/u],
    ['json number', '42', /is passed "42" as its spec/u],
    ['json string', '"hello"', /as its spec/u],
    ['malformed json', '{mark:bar', /is passed "\{mark:bar" as its spec/u],
  ]) {
    await withApp(
      {
        'src/queries/sales/revenue.json': null,
        'src/queries/sales/revenue.ts': null,
        'src/components/Chart.tsx':
          'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
          `export const C = () => <VegaVisual spec='${text}' />;\n`,
      },
      async (root) => {
        const { exitCode, report } = await validate(
          'validate-visual.mjs',
          root
        );
        assert.equal(exitCode, 1, `${label}: ${JSON.stringify(report)}`);
        assert.match(
          report.failures.join(' '),
          expected,
          `${label}: ${JSON.stringify(report)}`
        );
      }
    );
  }
});

test('validate:visual counts a VegaVisual with no spec and defers to typecheck', async () => {
  await withApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'export const Chart = () => <VegaVisual />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      // No spec prop at all is a type error, so it is left to `typecheck` - but
      // the element still has to be seen and accounted for here.
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.equal(
        report.checked.rendersVegaVisual,
        true,
        JSON.stringify(report)
      );
      assert.match(report.notes.join(' '), /npm run typecheck/u);
    }
  );
});

test('validate:visual schema-checks authored data instead of replacing it', async () => {
  // A stand-in DataTable is injected only when the spec has none. Injecting it
  // unconditionally overwrote authored sample data, so a malformed `values`
  // reached the browser with a clean validation behind it.
  await withSchemaApp(
    {
      'rayfin/rayfin.yml': null,
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        data: { values: 123 },
        mark: 'bar',
        encoding: { x: { field: 'x', type: 'quantitative' } },
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      // Names the authored rows, not some other property: proof the spec was
      // validated as written rather than with a stand-in over the top.
      assert.match(report.failures.join(' '), /data.{0,5}values/u);
    }
  );
});

test('validate:visual accepts authored rows that are well formed', async () => {
  // The positive control for the test above: same shape, legal `values`, so a
  // failure there can only come from the rows and not from the fixture.
  await withSchemaApp(
    {
      'rayfin/rayfin.yml': null,
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        data: { values: [{ x: 1 }] },
        mark: 'bar',
        encoding: { x: { field: 'x', type: 'quantitative' } },
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
    }
  );
});
test('validate:visual is not fooled by an unrelated object containing mark:', async () => {
  // Inline-spec detection has to see a spec actually reaching <VegaVisual>.
  // Treating any `mark:` in source as evidence let a chart with nothing to draw
  // pass, because some other object happened to use the same key.
  await withApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'const legendConfig = { mark: "none", label: "Legend" };\n' +
        'export const Chart = () => <VegaVisual />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      // The unrelated `mark:` must not be mistaken for this visual's spec. The
      // element has no spec of its own, so nothing is schema-checked and the
      // prop itself is left to `typecheck`.
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.equal(report.checked.inlineSpecs, 0, JSON.stringify(report));
      assert.match(report.notes.join(' '), /npm run typecheck/u);
    }
  );
});

test('validate:visual finds hard-coded data on a child of a composite spec', async () => {
  // A layer can carry its own data, and the recursion has to reach it — that is
  // the detection this pins. Whether it is a problem is the reader's call, so it
  // lands as a note; the threshold-layer test above is the reason why.
  await withApp(
    {
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        encoding: { x: { field: 'Region', type: 'nominal' } },
        layer: [
          { mark: 'bar' },
          { mark: 'line', data: { values: [{ Region: 'North', v: 99 }] } },
        ],
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.match(report.notes.join(' '), /connected to a semantic model/u);
    }
  );
});
test('validate:visual traces the spec prop to the object it names', async () => {
  // "A spec= prop somewhere" and "a mark: somewhere" are independently true of a
  // component that passes an empty object next to an unrelated config, so the
  // two have to be connected: follow the identifier to its declaration.
  await withApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        "const emptySpec = '{}';\n" +
        'const legend = { mark: "none" };\n' +
        'export const Chart = () => <VegaVisual spec={emptySpec} />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1);
      assert.match(report.failures.join(' '), /empty spec/u);
    }
  );
});

test('validate:visual resolves a spec name per file, not across the app', async () => {
  // Every chart component tends to name its constant `spec`. Resolving that name
  // against a concatenation of all sources would let one file's valid object
  // answer for another file's invalid one, and count it as checked.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/ChartA.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'const spec = { mark: "bar", encoding: { x: { field: "a", type: "nominal" } } };\n' +
        'export const ChartA = () => <VegaVisual spec={spec} />;\n',
      'src/components/ChartB.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'const spec = { mark: "line", encoding: { x: { field: "b", type: "nominl" } } };\n' +
        'export const ChartB = () => <VegaVisual spec={spec} />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.equal(report.failures.length, 1, JSON.stringify(report));
      assert.match(report.failures[0], /ChartB\.tsx/u);
    }
  );
});

test('validate:visual resolves a spec declared alongside other bindings', async () => {
  // Text matching missed `let a = {}, spec = {}` because the spec's binding does
  // not start with a declaration keyword. It failed closed - reporting a chart
  // with no spec - which blocks an app that works.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'let other = { a: 1 },\n' +
        '    spec = { mark: "bar", encoding: { x: { field: "x", type: "nominal" } } };\n' +
        'export const Chart = () => <VegaVisual spec={spec} />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.equal(report.checked.inlineSpecs, 1, JSON.stringify(report));
    }
  );
});

test('validate:visual checks only the VegaVisual that has a spec', async () => {
  // Each `<VegaVisual>` needs its own spec: an app-wide check that only asks
  // whether a spec exists somewhere passes a good chart next to an empty one.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'const good = { mark: "bar", encoding: { x: { field: "x", type: "nominal" } } };\n' +
        'export const Chart = () => (<><VegaVisual spec={good} /><VegaVisual /></>);\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      // The valid one is still read and schema-checked; the one with no spec is
      // counted and handed to `typecheck` rather than reported here.
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.equal(report.checked.inlineSpecs, 1, JSON.stringify(report));
      assert.match(report.notes.join(' '), /npm run typecheck/u);
    }
  );
});

test('validate:visual does not block a threshold layer in a model-backed app', async () => {
  // The case that made this a note rather than a failure: a rule layer drawing a
  // static target beside the model's bars is ordinary Vega-Lite, and failing it
  // blocked an app that was doing nothing wrong.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        layer: [
          {
            mark: 'bar',
            encoding: { x: { field: 'region', type: 'nominal' } },
          },
          {
            mark: 'rule',
            data: { values: [{ target: 500 }] },
            encoding: { y: { field: 'target', type: 'quantitative' } },
          },
        ],
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.equal(report.failures.length, 0, JSON.stringify(report));
    }
  );
});

test('validate:visual fails a top-level dataset the chart itself draws', async () => {
  // `datasets` + `data.name` is the named spelling of `data.values`. The rows
  // reach the chart either way, so in a model-backed app this is the same
  // failure as hard-coding them inline.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        datasets: { fake: [{ revenue: 999 }] },
        data: { name: 'fake' },
        mark: 'bar',
        encoding: { x: { field: 'revenue', type: 'quantitative' } },
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.match(report.failures.join(' '), /hard-codes the rows it draws/u);
    }
  );
});

test('validate:visual fails rows written into the data prop of a model app', async () => {
  // The `data` prop is the documented way to pass rows, so rows moved out of
  // `data.values` and into it are the same invented figures one spelling over.
  // Judging only the spec let that spelling through the check above.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'const spec = { mark: "bar", encoding: { x: { field: "a", type: "nominal" } } };\n' +
        'const table = { columns: [{ name: "a" }], rows: [[1]] };\n' +
        'export const Chart = () => <VegaVisual spec={spec} data={table} />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.match(
        report.failures.join(' '),
        /rows written into its data prop/u
      );
    }
  );
});

test('validate:visual fails authored rows bound through a shorthand property', async () => {
  // `{ columns, rows }` is the same authored table as `{ columns: [...], rows:
  // [...] }`. Reading a shorthand property as unresolvable made the object
  // unreadable, and an unreadable `data` prop counts as no authored rows - so
  // the identical table passed or failed depending on how it was spelled.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'const spec = { mark: "bar", encoding: { x: { field: "a", type: "nominal" } } };\n' +
        'const rows = [[1]];\n' +
        'const table = { columns: [{ name: "a" }], rows };\n' +
        'export const Chart = () => <VegaVisual spec={spec} data={table} />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.match(
        report.failures.join(' '),
        /rows written into its data prop/u
      );
    }
  );
});

test('validate:visual accepts a data prop the app fills at runtime', async () => {
  // The counter-case that keeps the check above honest: a query result reaches
  // the prop through a call, so there are no authored rows to find. An empty
  // table is not invented figures either.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'import { toDataTable } from "../lib/to-data-table";\n' +
        'declare const result: never;\n' +
        'const spec = { mark: "bar", encoding: { x: { field: "a", type: "nominal" } } };\n' +
        'const empty = { columns: [{ name: "a" }], rows: [] };\n' +
        'export const A = () => <VegaVisual spec={spec} data={toDataTable(result)} />;\n' +
        'export const B = () => <VegaVisual spec={spec} data={empty} />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.equal(report.failures.length, 0, JSON.stringify(report));
    }
  );
});

test('validate:visual catches inline spec errors the compiler cannot see', async () => {
  // Why the schema still runs on inline objects even though `typecheck` owns the
  // prop shape and the enum-like fields: it does not see a value out of range,
  // and it does not see a composite that resolves to no mark. Both are measured
  // misses, so these fail and say why if inline AJV is ever deduplicated away.
  //
  // Each case names the offending keyword rather than counting failures: an
  // out-of-range opacity has to fail *because of the opacity*, not because the
  // mark happens to be an object. The middle row is the control that proves it.
  for (const [label, spec, expected] of [
    [
      'value out of range',
      '{ mark: { type: "bar", opacity: 5 }, encoding: { x: { field: "a", type: "nominal" } } }',
      /opacity/u,
    ],
    [
      'same shape, legal value',
      '{ mark: { type: "bar", opacity: 0.5 }, encoding: { x: { field: "a", type: "nominal" } } }',
      null,
    ],
    ['composite with no mark', '{ layer: [] }', /no mark/u],
  ]) {
    await withSchemaApp(
      {
        'src/queries/sales/revenue.json': null,
        'src/queries/sales/revenue.ts': null,
        'src/components/Chart.tsx':
          'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
          `const spec = ${spec};\n` +
          'export const Chart = () => <VegaVisual spec={spec} />;\n',
      },
      async (root) => {
        const { exitCode, report } = await validate(
          'validate-visual.mjs',
          root
        );
        if (expected === null) {
          assert.equal(exitCode, 0, `${label}: ${JSON.stringify(report)}`);
          assert.equal(
            report.failures.length,
            0,
            `${label}: ${JSON.stringify(report)}`
          );
          return;
        }
        assert.equal(exitCode, 1, `${label}: ${JSON.stringify(report)}`);
        assert.match(
          report.failures.join(' '),
          expected,
          `${label}: ${JSON.stringify(report)}`
        );
      }
    );
  }
});

test('validate:visual reads the data prop last-wins across spreads', async () => {
  // Same ordering the spec reader uses. A spread only makes the value unknown
  // when nothing definitive follows it, so the trailing literal is still read
  // and the earlier fallback is not what gets judged.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'declare const props: never;\n' +
        'const spec = { mark: "bar", encoding: { x: { field: "a", type: "nominal" } } };\n' +
        'const fallback = { columns: [{ name: "a" }], rows: [] };\n' +
        'const literal = { columns: [{ name: "a" }], rows: [[1]] };\n' +
        'export const Chart = () => <VegaVisual spec={spec} data={fallback} {...props} data={literal} />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.match(
        report.failures.join(' '),
        /rows written into its data prop/u
      );
    }
  );
});

test('validate:visual gives up on a data prop a trailing spread may replace', async () => {
  // The counter-case: nothing definitive follows the spread, so what reaches the
  // chart is unknown and the authored rows must not be reported as certain.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'declare const props: never;\n' +
        'const spec = { mark: "bar", encoding: { x: { field: "a", type: "nominal" } } };\n' +
        'const table = { columns: [{ name: "a" }], rows: [[1]] };\n' +
        'export const Chart = () => <VegaVisual spec={spec} data={table} {...props} />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validateAllowingIncomplete(
        'validate-visual.mjs',
        root
      );
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.equal(report.failures.length, 0, JSON.stringify(report));
    }
  );
});

test('validate:visual fails a named map of rows written into the data prop', async () => {
  // The `data` prop also takes `Record<string, DataTable>`, which has no rows of
  // its own - reading only the top level let a fully authored map through.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'const spec = { mark: "bar", encoding: { x: { field: "a", type: "nominal" } } };\n' +
        'const tables = { sales: { columns: [{ name: "a" }], rows: [[1]] } };\n' +
        'export const Chart = () => <VegaVisual spec={spec} data={tables} />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.match(
        report.failures.join(' '),
        /rows written into its data prop/u
      );
    }
  );
});

test('validate:visual does not fail an unrecognised component for its data prop', async () => {
  // The invariant for an unknown tag is that it is counted, never failed: the
  // `spec` prop may belong to some other component, and so may `data` — whose
  // rows might not be a DataTable at all.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { Visual } from "./visuals-barrel";\n' +
        'const spec = { mark: "bar", encoding: { x: { field: "a", type: "nominal" } } };\n' +
        'const table = { columns: [{ name: "a" }], rows: [[1]] };\n' +
        'export const Chart = () => <Visual spec={spec} data={table} />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validateAllowingIncomplete(
        'validate-visual.mjs',
        root
      );
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.equal(report.failures.length, 0, JSON.stringify(report));
    }
  );
});

test('validate:visual notes a top-level dataset only a child layer draws', async () => {
  // `datasets` is top-level only, so a named threshold sits at the root even
  // though the rule layer is the only thing that reads it. Reading position
  // from where the rows are written rather than from what draws them blocked
  // this, which is the named spelling of the threshold case below.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        datasets: { target: [{ value: 500 }] },
        layer: [
          {
            data: { name: 'table' },
            mark: 'bar',
            encoding: {
              x: { field: 'region', type: 'nominal' },
              y: { field: 'revenue', type: 'quantitative' },
            },
          },
          {
            data: { name: 'target' },
            mark: 'rule',
            encoding: { y: { field: 'value', type: 'quantitative' } },
          },
        ],
      }),
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.match(report.notes.join(' '), /connected to a semantic model/u);
    }
  );
});

test('validate:visual resolves a spec name in its own component scope', async () => {
  // Two components in one file both calling their local constant `spec` is
  // ordinary code. Each usage has to resolve to the declaration in its own
  // scope: taking the first declaration in the file lets one component's spec
  // answer for another, reporting it checked without ever looking at it. Same
  // failure as the cross-file case below, one scope further in.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Charts.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'export function ChartA() {\n' +
        '  const spec = { mark: "bar", encoding: { x: { field: "a", type: "nominal" } } };\n' +
        '  return <VegaVisual spec={spec} />;\n' +
        '}\n' +
        'export function ChartB() {\n' +
        '  const spec = { mark: "line", encoding: { x: { field: "b", type: "nominl" } } };\n' +
        '  return <VegaVisual spec={spec} />;\n' +
        '}\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.equal(report.failures.length, 1, JSON.stringify(report));
      assert.match(report.failures[0], /Charts\.tsx:8/u);
      assert.equal(report.checked.inlineSpecs, 2, JSON.stringify(report));
    }
  );
});

test('validate:visual leaves a spec prop the compiler rejects to typecheck', async () => {
  // `spec={null}` is a type error, and `typecheck` is a required gate that runs
  // before this one, so reporting it here would say the same thing twice.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'export const Chart = () => <VegaVisual spec={null} />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.equal(report.failures.length, 0, JSON.stringify(report));
      assert.match(report.notes.join(' '), /npm run typecheck/u);
    }
  );
});

test('validate:visual blocks incomplete runtime specs unless explicitly allowed', async () => {
  // The analytics path is written this way on purpose, so the preview escape
  // hatch permits deployment for browser validation. The normal final gate
  // remains nonzero and neither route claims schema validation completed.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'const buildSpec = () => ({ mark: "bar" });\n' +
        'export const Chart = () => <VegaVisual spec={buildSpec()} />;\n',
    },
    async (root) => {
      const result = await validate('validate-visual.mjs', root);
      assert.equal(result.exitCode, 1, JSON.stringify(result.report));
      assert.equal(result.report.status, 'incomplete');
      assert.equal(result.report.coverage, 'none');
      assert.equal(result.report.ok, false);
      assert.equal(result.report.checked.specs, 0);
      assert.equal(result.report.checked.runtimeSpecs, 1);
      assert.equal(result.report.checked.schemasChecked, 0);
      assert.equal(result.report.checked.uncheckedSpecs, 1);
      assert.match(
        result.report.notes.join(' '),
        /Schema coverage is zero: 0 schemas checked; 1 runtime\/computed spec/u
      );
      const preview = await validate('validate-visual.mjs', root, [
        '--allow-incomplete',
      ]);
      assert.equal(preview.exitCode, 0, JSON.stringify(preview.report));
      assert.equal(preview.report.status, 'incomplete');
      assert.equal(preview.report.coverage, 'none');
      assert.equal(preview.report.ok, false);
    }
  );
});

test('validate:visual stays incomplete when runtime specs accompany checked files', async () => {
  // Nothing maps a runtime expression to the .json it probably came from, so
  // validated files cannot be claimed as cover for it. The counts are stated
  // either way, and browser validation is still required for the runtime spec.
  await withSchemaApp(
    {
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'import { chart } from "@/queries/sales/revenue";\n' +
        'export const Chart = () => <VegaVisual spec={chart.vegaLiteSpec} />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.equal(report.status, 'incomplete', JSON.stringify(report));
      assert.equal(report.coverage, 'partial', JSON.stringify(report));
      assert.equal(report.ok, false, JSON.stringify(report));
      assert.equal(report.checked.runtimeSpecs, 1, JSON.stringify(report));
      assert.equal(report.checked.schemasChecked, 1, JSON.stringify(report));
      assert.equal(report.checked.uncheckedSpecs, 1, JSON.stringify(report));
      assert.match(
        report.notes.join(' '),
        /Schema coverage is partial: 1 schema\(s\) checked; 1 runtime\/computed spec/u
      );
      assert.match(
        report.notes.join(' '),
        /Browser validation is still required/u
      );
    }
  );
});

test('validate:visual failure wins over incomplete coverage even when allowed', async () => {
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': JSON.stringify({
        $schema: GOOD_SPEC.$schema,
        mark: 'bar',
        encoding: { x: { field: 'Region', type: 'nominl' } },
      }),
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'const buildSpec = () => ({ mark: "bar" });\n' +
        'export const Chart = () => <VegaVisual spec={buildSpec()} />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root, [
        '--allow-incomplete',
      ]);
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.equal(report.status, 'failed');
      assert.equal(report.coverage, 'partial');
      assert.equal(report.ok, false);
      assert.equal(report.checked.schemasChecked, 1);
      assert.equal(report.checked.uncheckedSpecs, 1);
      assert.match(report.failures.join(' '), /Vega-Lite schema/u);
    }
  );
});

test('validate:visual fails a spec prop that is a string or bare', async () => {
  // `spec="invalid"` is a JSX string attribute and `spec` alone is `spec={true}`.
  // Neither reaches the expression path, so both have to be reported rather
  // than falling through a state the reporting loop does not handle.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'export const A = () => <VegaVisual spec="invalid" />;\n' +
        'export const B = () => <VegaVisual spec />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      // Only the string is reported: `spec` bare is `spec={true}`, which the
      // compiler rejects, so it is left to `typecheck`.
      assert.equal(report.failures.length, 1, JSON.stringify(report));
      assert.match(report.failures.join(' '), /"invalid" as its spec/u);
      assert.match(report.notes.join(' '), /npm run typecheck/u);
    }
  );
});

test('validate:visual counts a spread that could carry or override the spec', async () => {
  // `{...props}` may supply a spec, and a spread after `spec=` overrides it, so
  // neither is a missing spec and neither can be claimed as checked.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'const spec = { mark: "bar", encoding: { x: { field: "a", type: "nominal" } } };\n' +
        'export const A = (props) => <VegaVisual {...props} />;\n' +
        'export const B = (props) => <VegaVisual spec={spec} {...props} />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validateAllowingIncomplete(
        'validate-visual.mjs',
        root
      );
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.equal(report.failures.length, 0, JSON.stringify(report));
      assert.equal(report.checked.runtimeSpecs, 2, JSON.stringify(report));
    }
  );
});

test('validate:visual sees VegaVisual imported under another name', async () => {
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual as Visual } from "@microsoft/fabric-visuals";\n' +
        'export const Chart = () => <Visual spec="not a spec" />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.match(report.failures.join(' '), /<Visual>/u);
    }
  );
});

test('validate:visual does not borrow a binding from a sibling block', async () => {
  // JavaScript resolves the usage to the function-level `spec`. A search that
  // descends into the earlier block finds the valid one first and approves the
  // invalid spec that actually renders.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'export function Chart(flag) {\n' +
        '  if (flag) {\n' +
        '    const spec = { mark: "bar", encoding: { x: { field: "a", type: "nominal" } } };\n' +
        '    console.log(spec);\n' +
        '  }\n' +
        '  const spec = { mark: "line", encoding: { x: { field: "b", type: "nominl" } } };\n' +
        '  return <VegaVisual spec={spec} />;\n' +
        '}\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      // ajv 8 reports a JSON pointer, `/encoding/x/type`. Matched loosely so
      // the assertion is about the location, not one version's punctuation.
      assert.match(report.failures.join(' '), /encoding.{0,5}x.{0,5}type/u);
    }
  );
});

test('validate:visual resolves a var declared inside a block', async () => {
  // `var` is hoisted to its function, so treating it as block-scoped missed the
  // declaration and reported a working chart as having no spec. A false failure
  // blocks a deployable app, which is worse than a missed check.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'export function Chart(flag) {\n' +
        '  if (flag) {\n' +
        '    var spec = { mark: "bar", encoding: { x: { field: "a", type: "nominal" } } };\n' +
        '  }\n' +
        '  return <VegaVisual spec={spec} />;\n' +
        '}\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.equal(report.checked.inlineSpecs, 1, JSON.stringify(report));
    }
  );
});

test('validate:visual follows a component re-bound to a local name', async () => {
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'const Visual = VegaVisual;\n' +
        'export const Chart = () => <Visual spec="not a spec" />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.match(report.failures.join(' '), /<Visual>/u);
    }
  );
});

test('validate:visual reads a static spread instead of giving up on it', async () => {
  // `{...{ data: [] }}` provably does not touch `spec`, so the string beside it
  // is still the spec that renders. `{...{ spec: "..." }}` is the same value one
  // level in. Treating either as unknown turned a certain failure into a note.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'export const A = () => <VegaVisual spec="not a spec" {...{ data: [] }} />;\n' +
        'export const B = () => <VegaVisual {...{ spec: "also not" }} />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.equal(report.failures.length, 2, JSON.stringify(report));
    }
  );
});

test('validate:visual counts an unrecognised component that takes a spec', async () => {
  // A visual re-exported through a barrel cannot be tied back to the import
  // without resolving the module graph. Counted and reported rather than
  // skipped, and never failed - the prop could belong to something else.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { Visual } from "./visuals-barrel";\n' +
        'export const Chart = () => <Visual spec="not a spec" />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validateAllowingIncomplete(
        'validate-visual.mjs',
        root
      );
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.equal(report.failures.length, 0, JSON.stringify(report));
      assert.equal(report.checked.runtimeSpecs, 1, JSON.stringify(report));
      assert.match(report.notes.join(' '), /Schema coverage is zero/u);
    }
  );
});

test('validate:visual reads a spec carried by a shorthand spread', async () => {
  // `{...{ spec }}` is shorthand for `{ spec: spec }`. Only handling explicit
  // `spec: value` reported this valid component as having no spec at all.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'const spec = { mark: "bar", encoding: { x: { field: "a", type: "nominal" } } };\n' +
        'export const Chart = () => <VegaVisual {...{ spec }} />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.equal(report.checked.inlineSpecs, 1, JSON.stringify(report));
      assert.equal(report.failures.length, 0, JSON.stringify(report));
    }
  );
});

test('validate:visual downgrades when a nested spread can replace the spec', async () => {
  // Object keys are last-wins like JSX props, so `props` here can override the
  // `spec` written beside it. Validating the visible one and saying nothing
  // reports a spec that may never render.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'const valid = { mark: "bar", encoding: { x: { field: "a", type: "nominal" } } };\n' +
        'export const Chart = (props) => <VegaVisual {...{ spec: valid, ...props }} />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validateAllowingIncomplete(
        'validate-visual.mjs',
        root
      );
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.equal(report.checked.runtimeSpecs, 1, JSON.stringify(report));
      assert.equal(report.checked.inlineSpecs, 0, JSON.stringify(report));
    }
  );
});

test('validate:visual surfaces an unrecognised component whose spec arrives by spread', async () => {
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { Visual } from "./barrel";\n' +
        'export const Chart = () => <Visual {...{ spec: null }} />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validateAllowingIncomplete(
        'validate-visual.mjs',
        root
      );
      assert.equal(exitCode, 0, JSON.stringify(report));
      assert.equal(report.checked.runtimeSpecs, 1, JSON.stringify(report));
      assert.match(report.notes.join(' '), /Schema coverage is zero/u);
    }
  );
});

test('validate:visual schema-checks an inline spec', async () => {
  // Sample-data apps commonly define specs inline in TSX, so those specs need
  // the same schema checks as specs imported from JSON.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'const spec = { mark: "bar", encoding: { x: { field: "x", type: "nominl" } } };\n' +
        'export const Chart = () => <VegaVisual spec={spec} />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.match(report.failures.join(' '), /Chart\.tsx:\d+ <VegaVisual>/u);
      // ajv 8 reports a JSON pointer, `/encoding/x/type`. Matched loosely so
      // the assertion is about the location, not one version's punctuation.
      assert.match(report.failures.join(' '), /encoding.{0,5}x.{0,5}type/u);
    }
  );
});

test('validate:visual reports a computed inline spec as unchecked, not failed', async () => {
  // The safety property. A literal that builds values from code cannot be read
  // without evaluating it, and guessing would fail specs that render perfectly.
  // It has to come back incomplete and be said out loud, so a successful final
  // gate is never mistaken for "everything here was verified".
  //
  // `opacity: 5` is the illustrative defect because it escapes both owners: the
  // annotation types it as a number, and this script cannot read the object.
  await withSchemaApp(
    {
      'src/queries/sales/revenue.json': null,
      'src/queries/sales/revenue.ts': null,
      'src/components/Chart.tsx':
        'import { VegaVisual } from "@microsoft/fabric-visuals";\n' +
        'import type { VisualizationSpec } from "@microsoft/fabric-visuals";\n' +
        'const palette = { bar: "#316" };\n' +
        'const spec: VisualizationSpec = { mark: { type: "bar", color: palette.bar, opacity: 5 },' +
        ' encoding: { x: { field: "x", type: "nominal" } } };\n' +
        'export const Chart = () => <VegaVisual spec={spec} />;\n',
    },
    async (root) => {
      const { exitCode, report } = await validate('validate-visual.mjs', root);
      assert.equal(exitCode, 1, JSON.stringify(report));
      assert.equal(report.status, 'incomplete', JSON.stringify(report));
      assert.equal(report.ok, false, JSON.stringify(report));
      assert.equal(
        report.checked.inlineSpecsUnchecked,
        1,
        JSON.stringify(report)
      );
      assert.match(report.notes.join(' '), /NOT schema-checked/u);
    }
  );
});
