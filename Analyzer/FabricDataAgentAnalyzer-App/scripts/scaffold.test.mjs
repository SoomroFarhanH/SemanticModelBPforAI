// scripts/scaffold.test.mjs — guards the pack seeding contract.
//
// Run with `npm run test:template` (Node's built-in runner; no dependencies).
//
// These exercise the seeding *mechanism* against synthetic fixtures rather than
// against whatever the analytics pack happens to ship. A pack that decides not
// to seed `src/App.tsx` is a product decision; it should not break the tests
// that prove seeding works.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  classifySeed,
  installPackDirectory,
  renderYamlScalar,
  resolvePackDirectory,
  seedDigest,
  setServiceProperty,
} from './scaffold.mjs';

/** A stand-in for a template file a pack might replace while still pristine. */
const BASE_STARTER = [
  "import { createRoot } from 'react-dom/client';",
  '',
  "import App from '@/App';",
  '',
  "createRoot(document.getElementById('root')!).render(<App />);",
  '',
].join('\n');

/** The same file after somebody wired real work into it. */
const CUSTOMIZED = [
  "import { createRoot } from 'react-dom/client';",
  '',
  "import App from '@/App';",
  "import { AuthProvider } from '@/hooks/use-auth';",
  "import { bootstrapAuth } from '@/services/rayfin-auth.service';",
  '',
  'const authService = bootstrapAuth();',
  "createRoot(document.getElementById('root')!).render(",
  '  <AuthProvider rayfinAuthService={authService}><App /></AuthProvider>,',
  ');',
  '',
].join('\n');

/** What the pack would write in place of a pristine starter. */
const PACK_SEED = [
  "import { createRoot } from 'react-dom/client';",
  '',
  "import Dashboard from '@/Dashboard';",
  '',
  "createRoot(document.getElementById('root')!).render(<Dashboard />);",
  '',
].join('\n');

const entry = {
  from: 'kit/app/main.tsx',
  to: 'src/main.tsx',
  seedReplaceIfPristine: [seedDigest(BASE_STARTER)],
};

test('a missing destination is seeded', () => {
  assert.equal(
    classifySeed(entry, undefined, { sourceText: PACK_SEED }),
    'write'
  );
});

test('an untouched base starter is replaced by the pack seed', () => {
  assert.equal(
    classifySeed(entry, BASE_STARTER, { sourceText: PACK_SEED }),
    'write'
  );
});

test('a customized file is preserved, not clobbered', () => {
  assert.equal(
    classifySeed(entry, CUSTOMIZED, { sourceText: PACK_SEED }),
    'preserve'
  );
});

test('any unrecognized content is preserved', () => {
  assert.equal(
    classifySeed(entry, '// something nobody predicted\n', {
      sourceText: PACK_SEED,
    }),
    'preserve'
  );
});

test('re-applying a pack over its own seed is reported as current', () => {
  assert.equal(
    classifySeed(entry, PACK_SEED, { sourceText: PACK_SEED }),
    'current'
  );
});

test('force overwrites a customized file', () => {
  assert.equal(
    classifySeed(entry, CUSTOMIZED, { sourceText: PACK_SEED, force: true }),
    'write'
  );
});

test('a legacy seedReplaceIfContains entry preserves rather than guesses', () => {
  const legacy = {
    from: 'kit/app/main.tsx',
    to: 'src/main.tsx',
    seedReplaceIfContains: 'App',
  };
  assert.equal(
    classifySeed(legacy, BASE_STARTER, { sourceText: PACK_SEED }),
    'preserve'
  );
});

test('digests ignore line-ending and BOM differences', () => {
  const crlf = BASE_STARTER.replace(/\n/g, '\r\n');
  const bom = `\uFEFF${BASE_STARTER}`;
  assert.equal(seedDigest(crlf), seedDigest(BASE_STARTER));
  assert.equal(seedDigest(bom), seedDigest(BASE_STARTER));
});

test('an ordinary copy entry with no seed rule is preserved once it exists', () => {
  // Plain entries carry no `seedReplaceIfPristine`, so an existing file is never
  // silently overwritten - that is what keeps a pack from clobbering your work.
  const plain = {
    from: 'kit/lib/connectors.ts',
    to: 'src/lib/connectors.ts',
  };
  assert.equal(
    classifySeed(plain, 'edited by hand', { sourceText: 'new' }),
    'preserve'
  );
  assert.equal(classifySeed(plain, undefined, { sourceText: 'new' }), 'write');
});

test('a pack can expose a command name that differs from its skill directory', () => {
  assert.match(
    resolvePackDirectory('functions'),
    /[\\/]functions-capability$/u
  );
});

test('a malformed pack manifest reports the file instead of a raw parse error', () => {
  const skillsRoot = mkdtempSync(join(os.tmpdir(), 'pack-manifests-'));
  try {
    const broken = join(skillsRoot, 'broken');
    mkdirSync(broken);
    writeFileSync(join(broken, 'pack.json'), '{ not-json', 'utf8');

    assert.throws(
      () => resolvePackDirectory('missing', skillsRoot),
      /Malformed pack manifest: .*broken[\\/]pack\.json[\s\S]*Expected property name/u
    );
  } finally {
    rmSync(skillsRoot, { recursive: true, force: true });
  }
});

test('service properties are added and updated without replacing the service', () => {
  const original = [
    'services:',
    '  functions:',
    '    enabled: false',
    '  storage:',
    '    enabled: false',
    '',
  ].join('\n');

  const enabled = setServiceProperty(original, 'functions', 'enabled', true);
  const configured = setServiceProperty(
    enabled,
    'functions',
    'buildCommand',
    'npm run build'
  );

  // An added property lands after the ones already there, so a pack writing
  // several leaves them in the order it declared them.
  assert.match(
    configured,
    /functions:\n {4}enabled: true\n {4}buildCommand: "npm run build"/u
  );
  assert.match(configured, /storage:\n {4}enabled: false/u);
});

test('service string properties are escaped as valid YAML scalars', () => {
  const original = 'services:\n  functions:\n    enabled: true\n';

  assert.match(
    setServiceProperty(
      original,
      'functions',
      'buildCommand',
      'npm run build: app'
    ),
    /buildCommand: "npm run build: app"/u
  );
  assert.match(
    setServiceProperty(original, 'functions', 'buildCommand', '# disabled'),
    /buildCommand: "# disabled"/u
  );
  assert.match(
    setServiceProperty(original, 'functions', 'buildCommand', 'line1\nline2'),
    /buildCommand: "line1\\nline2"/u
  );
});

test('Functions auth is the only supported non-scalar service property', () => {
  for (const value of [{ type: 'application' }, [], undefined, Infinity]) {
    assert.throws(() => renderYamlScalar(value), /finite scalar values/u);
  }
  assert.throws(
    () => setServiceProperty('', 'data', 'auth', { type: 'application' }),
    /finite scalar values/u
  );
  for (const value of [
    null,
    {},
    [],
    'application',
    { type: 'delegated' },
    { type: 'unknown' },
    { type: 'application', extra: true },
  ]) {
    assert.throws(
      () => setServiceProperty('', 'functions', 'auth', value),
      /services\.functions\.auth\.type.*application/u
    );
  }
});

test('missing Functions auth is written as a nested mapping', () => {
  for (const original of [
    'name: app\n',
    'services:\n  data:\n    enabled: false\n',
    'services:\n  functions:\n    enabled: false\n',
    'services:\n  functions: # settings\n    enabled: true\n  # next service\n  data:\n    enabled: false\n',
  ]) {
    const output = setServiceProperty(original, 'functions', 'auth', {
      type: 'application',
    });
    assert.match(output, /^ {4}auth:\n {6}type: "application"$/mu);
    assert.equal(output.match(/^ {4}auth:/gmu).length, 1);
    assert.equal(output.match(/^ {2}functions:/gmu).length, 1);
    assert.equal(
      setServiceProperty(output, 'functions', 'auth', { type: 'application' }),
      output
    );
  }
});

test('auth keeps literal application block and flow mappings with comments', () => {
  for (const auth of [
    '    auth:\n      type: application\n',
    '    auth: # chosen auth\n# comment at column zero\n      type: "application" # keep me\n',
    "    auth:\n      'type': 'application'\n",
    '    auth: { type: application } # keep flow style\n',
    '    auth: {"type":"application"}\n',
    "    auth: { 'type': 'application', }\n",
  ]) {
    const original =
      `services:\n  functions:\n    enabled: false\n${auth}` +
      '    path: custom/functions\n    settings:\n      nested: true\n';
    assert.equal(
      setServiceProperty(original, 'functions', 'auth', {
        type: 'application',
      }),
      original
    );
  }
});

test('explicit invalid or ambiguous Functions auth is never replaced', () => {
  for (const auth of [
    '    auth: null\n',
    '    auth: ~\n',
    '    auth:\n',
    '    auth: # not a missing key\n',
    '    auth: {}\n',
    '    auth: []\n',
    '    auth: application\n',
    '    auth: true\n',
    '    auth:\n      other: application\n',
    '    auth:\n      type:\n',
    '    auth:\n      type: null\n',
    '    auth:\n      type: delegated\n',
    '    auth: { type: unknown }\n',
    '    auth: { type: "Application" }\n',
    '    auth: { type: " application " }\n',
    '    auth: { type:application }\n',
    '    auth: { type: application#not-comment }\n',
    '    auth:\n      type: application\n      type: delegated\n',
    '    auth: { type: application, type: delegated }\n',
    '    auth: { type: application }\n    auth: { type: delegated }\n',
    '    auth: { type: application }\n      orphan: true\n',
    '    auth: &auth\n      type: application\n',
    '    auth: *auth\n',
    '    auth: !Auth { type: application }\n',
    '    auth:\n      <<: *auth\n',
    '    auth:\n      type: >-\n        application\n',
    '    auth:\n      type: application\n        continuation\n',
    '    auth:\n        type: application\n',
    '    auth:\n      "type\': application\n',
    '    auth:\n      "type":"application"\n',
    "    auth:\n      'type':'application'\n",
    '    "auth": { type: delegated }\n',
    '    <<: *settings\n',
    '   auth: { type: delegated }\n',
    '\tauth: { type: delegated }\n',
  ]) {
    assert.throws(
      () =>
        setServiceProperty(
          `services:\n  functions:\n    enabled: false\n${auth}`,
          'functions',
          'auth',
          { type: 'application' }
        ),
      /services\.functions\.auth\.type[\s\S]*application/u,
      auth
    );
  }
});

test('Functions auth rejects ambiguous parent blocks instead of adding keys', () => {
  for (const original of [
    'services: { functions: { auth: { type: delegated } } }\n',
    'services:\n  functions: { auth: { type: delegated } }\n',
    'services:\n  functions: &fn\n    auth: { type: application }\n',
    'services:\n  functions:\n    enabled: false\n  functions:\n    auth: { type: delegated }\n',
    'services:\n  functions:\n    enabled: false\nservices:\n  functions:\n    auth: { type: delegated }\n',
    '"services":\n  functions:\n    auth: { type: delegated }\n',
    '  services:\n    functions:\n      auth: { type: delegated }\n',
    'services:\n  "functions":\n    auth: { type: delegated }\n',
    'services:\n   functions:\n    auth: { type: delegated }\n',
    'services:\n    functions:\n      auth: { type: delegated }\n',
    'services:\n  <<: *services\n',
    '<<: *settings\n',
  ]) {
    assert.throws(
      () =>
        setServiceProperty(original, 'functions', 'auth', {
          type: 'application',
        }),
      /services\.functions\.auth\.type[\s\S]*application/u,
      original
    );
  }
});

test('a property left without a value is filled in, not duplicated', () => {
  // Matching only properties that already carry a value would leave this one
  // unmatched and append a second `dialect:`. A duplicate key is worse than
  // either overwriting or preserving, so the match has to be value-agnostic.
  const original = 'services:\n  data:\n    enabled: true\n    dialect:\n';

  const out = setServiceProperty(original, 'data', 'dialect', 'mssql');

  assert.match(out, /^ {4}dialect: "mssql"$/mu);
  assert.equal(
    out.match(/^ {4}dialect:/gmu).length,
    1,
    'the property must appear exactly once'
  );
});

test('YAML comments do not split a service into duplicate keys', () => {
  // Comments carry no indentation contract in YAML, so a header comment or one
  // sitting at two-space indent inside a block are both valid. Reading either as
  // "no service here" or "a sibling service starts here" writes a second key,
  // and a duplicate is worse than either overwriting or preserving.
  const headerComment = setServiceProperty(
    'services:\n  data: # database settings\n    enabled: false\n',
    'data',
    'dialect',
    'mssql'
  );
  assert.equal(
    headerComment.match(/^ {2}data:/gmu).length,
    1,
    'a trailing comment must not hide the service header'
  );
  assert.match(headerComment, /^ {4}dialect: "mssql"$/mu);

  const innerComment = setServiceProperty(
    'services:\n  data:\n    enabled: true\n  # database dialect\n    dialect: postgresql\n',
    'data',
    'dialect',
    'mssql'
  );
  assert.equal(
    innerComment.match(/^ {4}dialect:/gmu).length,
    1,
    'a comment must not hide the property below it'
  );
});

test('a comment introducing the next service stays with it', () => {
  // A comment is never an insertion anchor: appending after one would separate
  // it from the line it describes.
  const out = setServiceProperty(
    'services:\n  data:\n    enabled: true\n  # auth section\n  auth:\n    enabled: true\n',
    'data',
    'dialect',
    'mssql'
  );

  assert.match(out, / {4}dialect: "mssql"\n {2}# auth section\n {2}auth:/u);
});

test('a column-zero comment does not end the services block', () => {
  // YAML comments carry no indentation semantics, so one at column zero sits
  // inside the block it appears in. Treating it as the end of `services:` hides
  // the real service, appends a duplicate key, and loses the value the user set.
  const before = [
    'services:',
    '  auth:',
    '    enabled: true',
    '# data settings',
    '  data:',
    '    enabled: true',
    '    dialect: postgresql',
    'other:',
    '  data: { not: ours }',
    '',
  ].join('\n');

  const patched = setServiceProperty(before, 'data', 'dialect', 'mssql');

  assert.equal(
    patched.match(/^ {2}data:$/gmu)?.length,
    1,
    'the block past the comment is the same one, not a second `data:`'
  );
  assert.doesNotMatch(
    patched,
    /dialect: postgresql/u,
    'the existing value is edited in place, not orphaned below a new block'
  );
  assert.match(
    patched,
    /^ {2}data:\n {4}enabled: true\n {4}dialect: "mssql"$/mu,
    'and the edit lands inside the real block'
  );
});

test('a service header outside the services block is not mistaken for ours', () => {
  // `  data:` is only ours when it sits under `services:`. An unscoped search
  // finds the first match anywhere in the file, so an unrelated top-level key
  // with a same-named child gets inspected — and, if it is a flow mapping,
  // refuses a file the writer could have edited perfectly well.
  const before = [
    'id: t',
    'name: t',
    'metadata:',
    '  data: { note: not ours }',
    'services:',
    '  data:',
    '    enabled: true',
    '',
  ].join('\n');

  const patched = setServiceProperty(before, 'data', 'dialect', 'mssql');
  assert.match(
    patched,
    /^ {4}dialect: "mssql"$/mu,
    'the real service is edited'
  );
  assert.match(
    patched,
    /^ {2}data: \{ note: not ours \}$/mu,
    'the unrelated block is left exactly as it was'
  );

  // The same holds after the block: only lines inside `services:` are ours.
  const trailing = [
    'services:',
    '  data:',
    '    enabled: true',
    'other:',
    '  data: &anchored { note: not ours }',
    '',
  ].join('\n');

  assert.match(
    setServiceProperty(trailing, 'data', 'dialect', 'mssql'),
    /^ {4}dialect: "mssql"$/mu,
    'a same-named key after the block must not refuse the edit'
  );
});

test('a non-block mapping is refused rather than silently duplicated', () => {
  // All valid YAML the line-based writer cannot see into, so it would append a
  // second key rather than edit the existing one. Anchors, tags and a flow
  // mapping opened on the following line are the same hazard spelled
  // differently, which is why the guard proves block shape instead of
  // enumerating the bad forms.
  for (const yaml of [
    'services: {}\n',
    'services:\n  data: { enabled: false }\n',
    'services:\n  data: &db { enabled: false }\n',
    'services:\n  data: !settings { enabled: false }\n',
    'services:\n  data:\n    { enabled: false }\n',
  ]) {
    assert.throws(
      () => setServiceProperty(yaml, 'data', 'dialect', 'mssql'),
      /not a plain block mapping/u,
      `\`${yaml.trim()}\` should be refused`
    );
  }

  // An unrelated service in flow style is not this writer's business.
  assert.match(
    setServiceProperty(
      'services:\n  auth: { enabled: true }\n  data:\n    enabled: true\n',
      'data',
      'dialect',
      'mssql'
    ),
    /^ {4}dialect: "mssql"$/mu,
    'a flow mapping on another service must not block the edit'
  );

  // Nesting below the property level is ordinary YAML, not a flow mapping: the
  // guard must not mistake a sequence entry or a sub-map for one.
  assert.match(
    setServiceProperty(
      'services:\n  data:\n    enabled: true\n    hosts:\n      - localhost\n    tls:\n      enabled: false\n',
      'data',
      'dialect',
      'mssql'
    ),
    /^ {4}dialect: "mssql"$/mu,
    'sequences and sub-maps under a property must still be editable'
  );
});

test('nested dependency installation runs in the declared directory', () => {
  const root = mkdtempSync(join(os.tmpdir(), 'pack-install-'));
  try {
    const installDir = join(root, 'rayfin', 'functions');
    mkdirSync(installDir, { recursive: true });
    const calls = [];

    const result = installPackDirectory({
      root,
      installPath: 'rayfin/functions',
      run: (command, options) => {
        calls.push({ command, options });
        return { status: 0 };
      },
      writeLog: () => {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'installed');
    assert.deepEqual(calls, [
      {
        command: 'npm install --ignore-scripts --no-audit --no-fund',
        options: {
          cwd: installDir,
          stdio: 'inherit',
          shell: true,
        },
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
