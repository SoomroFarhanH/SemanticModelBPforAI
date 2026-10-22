// scripts/agent-context.test.mjs — keeps the skill/docs boundary from regrowing.
//
// Run with `npm run test:template` (Node's built-in runner; no dependencies).
//
// Three checks, deliberately different in ambition:
//
//   1. Cross-reference integrity. Every skill a SKILL.md points at must exist.
//      Objective, no false positives. Two dangling references (`authentication`,
//      `fake-data`) shipped in this template before this check existed.
//
//   2. Package-owned tokens. A curated list of facts that Rayfin package docs
//      own must not be restated in a template skill. A *ratchet*: it prevents
//      regression of the specific duplications that were removed, and grows
//      when a new one is found. It does not claim to detect all duplication.
//
//   3. Overlap with the CLI's own `rayfin` skill. A generated app carries both
//      that skill and these, because `rayfin init` installs `skill:rayfin`
//      unconditionally and no template opt-out exists yet. Any Rayfin API a
//      template skill asserts *and* the CLI skill asserts is two copies of one
//      fact on two release cadences — which is how they end up disagreeing.
//      Unlike check 2 this needs no curated list: the comparison set is the
//      other file. It is skipped outside the monorepo, where the CLI's source
//      tree is not on disk.
//
// Rayfin's rules live in the installed packages (`rayfinDocs.dir`, today
// `assets/docs`) so they track the version a generated app actually has. Skills
// own this template: its layout, packs, kit files, and workflow.

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const templateRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const skillsRoot = path.join(templateRoot, '.agents', 'skills');

/**
 * The CLI's bundled skill, when this template is being edited inside the
 * monorepo. `samples/universal-app` → repo root → the CLI's asset tree. A
 * scaffolded app has no such path, and check 3 skips.
 */
const CLI_SKILL = path.resolve(
  templateRoot,
  '..',
  '..',
  '..',
  'packages/tools/cli/assets/agent-files/skills/rayfin/SKILL.md'
);

/**
 * Skills whose subject matter is owned by a Rayfin package. Only these are
 * checked for package-owned tokens; `dax-authoring` and friends describe
 * non-Rayfin surfaces and are out of scope for that half of the guard.
 */
const RAYFIN_SKILLS = new Set([
  'capability-router',
  'data-modeling',
  'crud-ui',
  'connectors',
  'functions-capability',
]);

/**
 * Skills the CLI writes into `.agents/skills/` of a scaffolded app rather than
 * ones this template ships. Pointing at them is correct and is the whole reason
 * a capability pack exists, but the folder is absent here until the CLI runs.
 *
 * Source of truth: `packages/tools/cli/src/services/agent-files/descriptors.ts`.
 */
const CLI_INSTALLED_SKILLS = new Set([
  'rayfin',
  'rayfin-functions',
  'rayfin-connectors',
]);

/**
 * Facts that a shipped Rayfin package doc owns. Restating one in a template
 * skill is the failure this catches, because the skill copy cannot track the
 * installed package version.
 *
 * Add an entry whenever a duplication is found and removed. Remove one only if
 * the owning doc stops covering it.
 */
const PACKAGE_OWNED_TOKENS = [
  {
    pattern: /NVARCHAR\(MAX\)/i,
    fact: 'the MSSQL unbounded-text constraint',
    owner: '@microsoft/rayfin-guide/assets/docs/known-limitations.md',
  },
  {
    pattern: /\bexecutePaginated\b/,
    fact: 'the pagination API',
    owner: '@microsoft/rayfin-data/assets/docs/index.md',
  },
  {
    pattern: /\bfindById\b/,
    fact: 'the single-record read API',
    owner: '@microsoft/rayfin-guide/assets/docs/data/graphql.md',
  },
  {
    pattern: /\{property\}_id/,
    fact: 'the foreign-key naming convention',
    owner: '@microsoft/rayfin-guide/assets/docs/known-limitations.md',
  },
  {
    pattern: /many[- ]to[- ]many/i,
    fact: 'the many-to-many join-entity rule',
    owner: '@microsoft/rayfin-guide/assets/docs/known-limitations.md',
  },
  {
    pattern: /experimentalDecorators/,
    fact: 'the TC39 decorator requirement',
    owner:
      '@microsoft/rayfin-guide/assets/docs/getting-started/project-structure.md',
  },
  {
    pattern: /claims\.(sub|email|role)\.eq\(/,
    fact: 'the policy DSL',
    owner: '@microsoft/rayfin-core/assets/docs/permissions.md',
  },
  {
    pattern: /\bimport type\b/,
    fact: 'the relationship runtime-import requirement',
    owner: '@microsoft/rayfin-core/assets/docs/decorators.md',
  },
  {
    pattern: /\bopaque string\b/i,
    fact: 'the subject-claim field type',
    owner: '@microsoft/rayfin-core/assets/docs/permissions.md',
  },
  {
    pattern: /session\.user\.id/,
    fact: 'owner-field stamping from the authenticated session',
    owner: '@microsoft/rayfin-core/assets/docs/permissions.md',
  },
];

/** A line that merely *points at* a doc is the behaviour we want, not a violation. */
const REFERENCE_LINE =
  /node_modules|assets\/docs|rayfinDocs|\]\(|rayfin-docs-gap/;

/** Skill names referenced as `` `name` `` in prose, or as a `.agents/skills/<name>/` path. */
const INLINE_SKILL_REF =
  /`([a-z][a-z0-9-]*)`\s+[Ss]kill|\*\*`([a-z][a-z0-9-]*)`\*\*\s+skill/g;
const PATH_SKILL_REF = /\.agents\/skills\/([a-z][a-z0-9-]+)\//g;
const RELATIVE_SKILL_REF = /\]\(\.\.\/([a-z][a-z0-9-]+)\/SKILL\.md\)/g;

function listSkillNames() {
  return readdirSync(skillsRoot).filter((name) =>
    statSync(path.join(skillsRoot, name)).isDirectory()
  );
}

function readSkill(name) {
  return readFileSync(path.join(skillsRoot, name, 'SKILL.md'), 'utf8');
}

/** Strip fenced code blocks — an identifier inside an example is not a claim. */
function withoutFences(markdown) {
  return markdown.replace(/```[\s\S]*?```/g, '');
}

/** Every skill name this file points at, from any of the three reference shapes. */
export function referencedSkills(markdown) {
  const found = new Set();
  for (const [, a, b] of markdown.matchAll(INLINE_SKILL_REF)) {
    found.add(a ?? b);
  }
  for (const [, name] of markdown.matchAll(PATH_SKILL_REF)) found.add(name);
  for (const [, name] of markdown.matchAll(RELATIVE_SKILL_REF)) found.add(name);
  return [...found];
}

/**
 * Package-owned tokens restated as claims.
 *
 * Scoped to paragraphs rather than lines: markdown wraps, so "read <doc> for
 * `findById`" routinely puts the token and the pointer on different lines. A
 * paragraph that points at a doc anywhere within it is doing the right thing.
 * Code fences are stripped first — an identifier in an example is not a claim.
 */
export function restatedTokens(markdown, tokens = PACKAGE_OWNED_TOKENS) {
  const violations = [];
  const lines = withoutFences(markdown).split('\n');

  let blockStart = 0;
  const flush = (end) => {
    const block = lines.slice(blockStart, end);
    const text = block.join('\n');
    if (text.trim() === '' || REFERENCE_LINE.test(text)) return;
    for (const token of tokens) {
      const offset = block.findIndex((line) => token.pattern.test(line));
      if (offset !== -1) {
        violations.push({
          line: blockStart + offset + 1,
          text: block[offset].trim(),
          ...token,
        });
      }
    }
  };

  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') {
      flush(index);
      blockStart = index + 1;
    }
  }
  flush(lines.length);

  return violations;
}

/**
 * Rayfin API surface asserted in a file, as normalized keys.
 *
 * Keys rather than prose, because prose comparison goes red on rewording and
 * then gets deleted. `@text({ max: 200 })` and `@text()` both key to `@text`,
 * so two files stating a rule about the same decorator collide however
 * differently they word it.
 *
 * Only Rayfin-shaped tokens count — decorators, client chain methods, claims,
 * and a few platform literals. `React`, `npm` and `tsc` are not Rayfin's, so
 * they never collide. Reference blocks and code fences are excluded on the same
 * basis as {@link restatedTokens}: pointing at a doc, or showing an example, is
 * not asserting a rule.
 */
export function assertedRayfinApi(markdown) {
  const found = new Map();
  const lines = withoutFences(markdown).split('\n');

  const literals = [
    [/NVARCHAR\(MAX\)/i, 'nvarchar(max)'],
    [/\{property\}_id/, '{property}_id'],
    [/experimentalDecorators/, 'experimentaldecorators'],
    [/ESNext\.Decorators/, 'esnext.decorators'],
  ];

  const keysIn = (span) => {
    const keys = new Set();
    // Package names and paths are pointers, not API. `@microsoft/rayfin-core`
    // must not key as the decorator `@microsoft`.
    if (span.includes('/')) return keys;
    for (const [, name] of span.matchAll(/@([a-z][a-zA-Z0-9]*)\s*\(/g)) {
      keys.add(`@${name.toLowerCase()}`);
    }
    const bareDecorator = span.trim().match(/^@([a-z][a-zA-Z0-9]*)$/);
    if (bareDecorator) keys.add(`@${bareDecorator[1].toLowerCase()}`);
    for (const [, name] of span.matchAll(/\.([a-z][a-zA-Z0-9]*)\s*\(/g)) {
      keys.add(`.${name.toLowerCase()}`);
    }
    const bareMethod = span.trim().match(/^([a-z][a-zA-Z0-9]*)\(\)?$/);
    if (bareMethod) keys.add(`.${bareMethod[1].toLowerCase()}`);
    for (const [, claim] of span.matchAll(/\bclaims\.([a-z]+)/g)) {
      keys.add(`claims.${claim}`);
    }
    for (const [pattern, key] of literals) {
      if (pattern.test(span)) keys.add(key);
    }
    return keys;
  };

  let blockStart = 0;
  const flush = (end) => {
    const block = lines.slice(blockStart, end);
    const text = block.join('\n');
    if (text.trim() === '' || REFERENCE_LINE.test(text)) return;
    for (const [offset, line] of block.entries()) {
      const spans = [...line.matchAll(/`([^`]+)`/g)].map(([, span]) => span);
      for (const [pattern, key] of literals) {
        if (pattern.test(line)) spans.push(key);
      }
      for (const span of spans) {
        for (const key of keysIn(span)) {
          if (!found.has(key)) {
            found.set(key, {
              line: blockStart + offset + 1,
              text: line.trim(),
            });
          }
        }
      }
    }
  };

  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') {
      flush(index);
      blockStart = index + 1;
    }
  }
  flush(lines.length);

  return found;
}

test('every referenced skill exists', () => {
  const templateSkills = listSkillNames();
  const known = new Set([...templateSkills, ...CLI_INSTALLED_SKILLS]);
  const failures = [];

  for (const skill of templateSkills) {
    for (const reference of referencedSkills(readSkill(skill))) {
      if (!known.has(reference)) {
        failures.push(
          `.agents/skills/${skill}/SKILL.md references \`${reference}\`, ` +
            `but .agents/skills/${reference}/ does not exist`
        );
      }
    }
  }

  assert.deepEqual(failures, [], `\n${failures.join('\n')}\n`);
});

test('Rayfin skills do not restate package-owned facts', () => {
  const failures = [];

  for (const skill of listSkillNames()) {
    if (!RAYFIN_SKILLS.has(skill)) continue;
    for (const violation of restatedTokens(readSkill(skill))) {
      failures.push(
        `.agents/skills/${skill}/SKILL.md:${violation.line} restates ` +
          `${violation.fact}, which is owned by ${violation.owner}.\n` +
          `    ${violation.text}\n` +
          `    Point at the doc instead of restating it.`
      );
    }
  }

  assert.deepEqual(failures, [], `\n${failures.join('\n')}\n`);
});

test('template skills do not assert what the CLI skill asserts', (t) => {
  if (!existsSync(CLI_SKILL)) {
    t.skip('CLI skill not on disk — running outside the monorepo');
    return;
  }

  const cli = assertedRayfinApi(readFileSync(CLI_SKILL, 'utf8'));
  const failures = [];

  for (const skill of listSkillNames()) {
    if (!RAYFIN_SKILLS.has(skill)) continue;
    for (const [key, here] of assertedRayfinApi(readSkill(skill))) {
      const there = cli.get(key);
      if (!there) continue;
      failures.push(
        `${key} is asserted in both skills — one fact, two release cadences.\n` +
          `    .agents/skills/${skill}/SKILL.md:${here.line}\n` +
          `      ${here.text}\n` +
          `    packages/tools/cli/assets/agent-files/skills/rayfin/SKILL.md:${there.line}\n` +
          `      ${there.text}\n` +
          `    Whichever of the two is describing Rayfin rather than its own surface\n` +
          `    should point at the owning package doc instead.`
      );
    }
  }

  assert.deepEqual(failures, [], `\n${failures.join('\n\n')}\n`);
});

test('every rayfin-docs-gap marker names a package', () => {
  const marker = /<!--\s*rayfin-docs-gap:\s*(@microsoft\/[a-z-]+)/g;
  const bare = /rayfin-docs-gap/g;

  for (const skill of listSkillNames()) {
    const body = readSkill(skill);
    const named = [...body.matchAll(marker)].length;
    const total = [...body.matchAll(bare)].length;
    // The maintainers' note in data-modeling mentions the marker by name once.
    assert.ok(
      named > 0 || total === 0 || skill === 'data-modeling',
      `.agents/skills/${skill}/SKILL.md has a rayfin-docs-gap marker with no package name`
    );
  }
});

// --- fixtures: prove the guard actually fires -------------------------------

test('guard fixture — a dangling reference is detected', () => {
  const found = referencedSkills(
    'Follow the **`authentication`** skill before writing data code.'
  );
  assert.deepEqual(found, ['authentication']);
  assert.ok(!listSkillNames().includes('authentication'));
});

test('guard fixture — a reintroduced package-owned fact is detected', () => {
  const reintroduced =
    'A bare `@text()` maps to NVARCHAR(MAX) on MSSQL and breaks GraphQL.';
  const violations = restatedTokens(reintroduced);
  assert.equal(violations.length, 1);
  assert.match(violations[0].owner, /known-limitations\.md$/u);
});

test('guard fixture — pointing at a doc is not a violation', () => {
  const pointer =
    'Read `node_modules/@microsoft/rayfin-guide/assets/docs/known-limitations.md` for NVARCHAR(MAX).';
  assert.deepEqual(restatedTokens(pointer), []);
});

test('guard fixture — a pointer wrapped across lines is not a violation', () => {
  const wrapped = [
    'The query chain, mutations and `findById` are documented in',
    '`rayfin-guide/assets/docs/data/graphql.md`.',
  ].join('\n');
  assert.deepEqual(restatedTokens(wrapped), []);
});

test('guard fixture — a claim in a neighbouring paragraph is still caught', () => {
  const mixed = [
    'Read `node_modules/@microsoft/rayfin-guide/assets/docs/data/graphql.md`.',
    '',
    'Use `findById` to fetch one row by its primary key.',
  ].join('\n');
  const violations = restatedTokens(mixed);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 3);
});

test('guard fixture — two files asserting the same decorator collide', () => {
  const cli = assertedRayfinApi(
    '- Every field needs exactly one decorator: `@text`, `@uuid`.'
  );
  const template = assertedRayfinApi(
    'The owner column is `@text()`, not `@uuid()`.'
  );

  const shared = [...template.keys()].filter((key) => cli.has(key));
  assert.deepEqual(shared.sort(), ['@text', '@uuid']);
});

test('guard fixture — a package name is not mistaken for a decorator', () => {
  const keys = assertedRayfinApi(
    'Read `@microsoft/rayfin-core/assets/docs/decorators.md`.'
  );
  assert.deepEqual([...keys.keys()], []);
});

test('guard fixture — pointing at a doc is not an assertion', () => {
  const pointing = assertedRayfinApi(
    'The `@role` decorator is documented in `rayfin-core/assets/docs/permissions.md`.'
  );
  assert.deepEqual([...pointing.keys()], []);
});
