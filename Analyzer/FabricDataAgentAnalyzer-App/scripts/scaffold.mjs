#!/usr/bin/env node
// scripts/scaffold.mjs — general capability-pack scaffolder for the universal app.
//
// One command turns a capability pack ON: it reads the pack's declarative
// manifest (`.agents/skills/<pack>/pack.json`) and, in one idempotent pass:
//   1. patches Fabric service flags in `rayfin/rayfin.yml`,
//   2. merges pinned dependencies into their owning workspace package and
//      scripts into the root `package.json`,
//   3. copies the pack's kit files into the project,
//   4. installs the merged dependencies with `npm install`.
//
// This replaces the slow, error-prone "copy ~60 files by hand + install ~40
// packages + rewire scripts" flow with `npm run pack:add <pack>`. It is
// pack-agnostic: future connectors/capabilities just ship their own `pack.json`.
//
// Usage:
//   node scripts/scaffold.mjs <pack> [--no-install] [--dry-run] [--force-seeds]
//   npm run pack:add -- <pack> [--no-install] [--dry-run] [--force-seeds]
//
// Flags:
//   --no-install   Do everything except `npm install` (fast; install yourself).
//   --dry-run      Print the planned actions without writing anything.
//   --force-seeds  Overwrite seed files even if you've customized them.
//
// Dependency versions:
//   A pack may pin a version literally ("^1.2.3") or as `match:<pkg>`, which
//   resolves to whatever version the app already pins for `<pkg>`. Use `match:`
//   for sibling Rayfin packages so they cannot drift apart across releases.
//
// This script runs before `node_modules` exists, so it imports Node built-ins
// only. That is why `rayfin.yml` is edited line by line rather than with a YAML
// parser — see `writeServiceProperty`, which refuses input it cannot patch
// safely instead of guessing.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = join(ROOT, '.agents', 'skills');

function parseArgs(argv) {
  const out = { pack: undefined, flags: {} };
  for (const a of argv) {
    if (a.startsWith('--')) out.flags[a.slice(2)] = true;
    else if (!out.pack) out.pack = a;
  }
  return out;
}

const log = (...m) => console.log(...m);
const warn = (...m) => console.warn(...m);

/**
 * Journal only the scaffolder's writes, not the app tree or npm's outputs.
 * An after-image guards rollback against edits made while npm was running.
 */
function createPackTransaction(root) {
  const files = new Map();
  const directories = new Map();
  const display = (path) => relative(root, path).replace(/\\/g, '/');
  const detail = (error) =>
    error instanceof Error ? error.message : String(error);

  function assertLocalPath(path) {
    const rel = relative(root, path);
    if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) {
      throw new Error(`Pack destination must stay inside the app: ${path}`);
    }
    for (let parent = dirname(path); ; parent = dirname(parent)) {
      const stat = lstatSync(parent, { throwIfNoEntry: false });
      if (stat && !stat.isDirectory()) {
        throw new Error(`Not a regular directory: ${display(parent)}`);
      }
      if (parent === root) break;
    }
  }

  function snapshot(path) {
    assertLocalPath(path);
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat) return undefined;
    if (!stat.isFile() || stat.nlink !== 1) {
      throw new Error(`Not a single-link regular file: ${display(path)}`);
    }
    return { bytes: readFileSync(path), stat };
  }

  function same(left, right) {
    if (!left || !right) return left === right;
    return (
      left.bytes.equals(right.bytes) &&
      // Windows can update ctime on read access, without a content change.
      ['dev', 'ino', 'mode', 'mtimeMs'].every(
        (key) => left.stat[key] === right.stat[key]
      )
    );
  }

  function makeParents(path) {
    const missing = [];
    for (
      let parent = dirname(path);
      !existsSync(parent);
      parent = dirname(parent)
    ) {
      missing.push(parent);
    }
    for (const directory of missing.reverse()) {
      mkdirSync(directory);
      directories.set(directory, lstatSync(directory));
    }
  }

  function mutate(path, operation) {
    const current = snapshot(path);
    const previous = files.get(path);
    if (previous && !same(current, previous.after)) {
      throw new Error(`File changed during pack application: ${display(path)}`);
    }
    const entry = {
      before: previous ? previous.before : current,
      after: current,
    };
    files.set(path, entry);
    try {
      operation();
    } finally {
      try {
        entry.after = snapshot(path);
      } catch (error) {
        // Keep the original write error; rollback will report this path too.
        entry.error = error;
      }
    }
    if (entry.error) throw entry.error;
  }

  return {
    installStarted: false,
    write(path, bytes) {
      mutate(path, () => {
        makeParents(path);
        writeFileSync(path, bytes);
      });
    },
    copy(from, to) {
      mutate(to, () => {
        makeParents(to);
        copyFileSync(from, to);
      });
    },
    remove(path) {
      mutate(path, () => rmSync(path));
    },
    rollback() {
      let restored = 0;
      let conflicts = 0;
      for (const [path, entry] of [...files].reverse()) {
        try {
          if (entry.error) throw entry.error;
          if (!same(snapshot(path), entry.after)) {
            throw new Error('changed after this pack wrote it');
          }
          if (same(entry.before, entry.after)) continue;
          if (entry.before) {
            writeFileSync(path, entry.before.bytes, {
              flag: entry.after ? 'w' : 'wx',
              mode: entry.before.stat.mode,
            });
            chmodSync(path, entry.before.stat.mode);
            utimesSync(path, entry.before.stat.atime, entry.before.stat.mtime);
          } else {
            rmSync(path);
          }
          restored++;
        } catch (error) {
          conflicts++;
          warn(`  ! rollback kept ${display(path)}: ${detail(error)}`);
        }
      }
      for (const [directory, created] of [...directories].reverse()) {
        try {
          assertLocalPath(directory);
          const current = lstatSync(directory, { throwIfNoEntry: false });
          if (!current) continue;
          if (
            !current.isDirectory() ||
            current.dev !== created.dev ||
            current.ino !== created.ino
          ) {
            throw new Error('directory changed during pack application');
          }
          // Never recursively remove a directory: npm or an editor may own its contents.
          rmdirSync(directory);
        } catch (error) {
          conflicts++;
          warn(`  ! rollback kept ${display(directory)}: ${detail(error)}`);
        }
      }
      if (restored) log(`\nRolled back ${restored} pack-owned file change(s).`);
      if (conflicts) {
        warn(
          '! Rollback is incomplete. Reconcile the listed paths before retrying.'
        );
      }
    },
  };
}

class PackInstallError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Escape a string for literal use inside a RegExp. */
function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whether a YAML scalar is a placeholder rather than a chosen value.
 *
 * Blank, a null form (`null`, `~`), or an empty string, each with or without a
 * trailing comment. The `(?:^|\s)` guard means `#` only opens a comment at the
 * start or after whitespace, so `null#TODO` stays a literal value.
 */
function isSemanticallyEmpty(current) {
  const value = current.replace(/(?:^|\s)#.*$/u, '').trim();
  return value === '' || /^(?:null|Null|NULL|~|""|'')$/u.test(value);
}

/** Render a JSON-compatible YAML scalar without changing its type. */
export function renderYamlScalar(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean' || value === null) return String(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  throw new Error('Pack service properties must be finite scalar values.');
}

function refuseFunctionsAuth() {
  throw new Error(
    'Cannot safely configure services.functions.auth.type in rayfin.yml.\n' +
      '   Only application authentication is supported, even when Functions are disabled.\n' +
      '   Use plain, two-space-indented services/functions blocks with a single auth mapping:\n' +
      '     auth:\n       type: application\n' +
      '   Rewrite unsupported YAML shapes explicitly, then re-run the pack. --force-seeds does not migrate auth.'
  );
}

/**
 * Recognize only a literal application auth mapping. Do not interpret general
 * YAML (merges, aliases, tags, duplicate keys, etc.) before dependencies exist.
 */
function hasApplicationFunctionsAuth(lines, servicesIdx, servicesEnd, svcIdx) {
  const meaningful = (line) => line.trim() !== '' && !/^\s*#/u.test(line);
  const rootKeys = lines.filter(
    (line) => meaningful(line) && /^\S/u.test(line)
  );
  if (
    (rootKeys.length === 0 && lines.some(meaningful)) ||
    rootKeys.some((line) => !/^[\w.-]+:(?:\s|$)/u.test(line)) ||
    rootKeys.filter((line) => /^services:/u.test(line)).length > 1
  ) {
    refuseFunctionsAuth();
  }
  if (servicesIdx === -1) return false;
  const serviceLines = lines.slice(servicesIdx + 1, servicesEnd);
  const firstServiceLine = serviceLines.find(meaningful);
  if (
    (firstServiceLine !== undefined &&
      !/^ {2}[\w.-]+:(?:\s|$)/u.test(firstServiceLine)) ||
    serviceLines.some(
      (line) =>
        meaningful(line) &&
        (/^\s*\t/u.test(line) ||
          (/^ {0,3}\S/u.test(line) && !/^ {2}[\w.-]+:(?:\s|$)/u.test(line)))
    ) ||
    serviceLines.filter((line) => /^ {2}functions:/u.test(line)).length > 1
  ) {
    refuseFunctionsAuth();
  }
  if (svcIdx === -1) return false;

  let auth;
  let inAuth = false;
  let hasProperty = false;
  for (let j = svcIdx + 1; j < servicesEnd; j++) {
    const line = lines[j];
    if (!meaningful(line)) continue;
    if (/^ {0,2}\S/u.test(line)) break;
    if (/^ {0,4}\S/u.test(line)) {
      if (!/^ {4}[\w.-]+:(?:\s|$)/u.test(line)) refuseFunctionsAuth();
      hasProperty = true;
      inAuth = /^ {4}auth:/u.test(line);
      if (inAuth) {
        if (auth) refuseFunctionsAuth();
        auth = [line.slice(line.indexOf(':') + 1).trim()];
      }
    } else if (inAuth) {
      auth.push(line);
    } else if (!hasProperty || /^\s*\t/u.test(line)) {
      refuseFunctionsAuth();
    }
  }
  if (!auth) return false;

  // Exact literal matches also keep comments/quotes without losing their
  // authored spelling. An explicit null or empty map is not a missing setting.
  const typeKey = '(?:type:[ \\t]+|(?:\'type\'|"type"):[ \\t]*)';
  const application = '(?:application|\'application\'|"application")';
  const comment = '(?:[ \\t]+#.*)?';
  const blockType = new RegExp(
    `^ {6}(?:type|'type'|"type"):[ \\t]+${application}${comment}[ \\t]*$`,
    'u'
  );
  const flowAuth = new RegExp(
    `^\\{[ \\t]*${typeKey}${application}[ \\t]*,?[ \\t]*\\}${comment}[ \\t]*$`,
    'u'
  );
  const isBlock =
    /^(?:#.*)?$/u.test(auth[0]) && auth.length === 2 && blockType.test(auth[1]);
  const isFlow = auth.length === 1 && flowAuth.test(auth[0]);
  if (!isBlock && !isFlow) refuseFunctionsAuth();
  return true;
}

/**
 * Set `services.<service>.<property>` in a rayfin.yml string, adding the service
 * block, and a `services:` block, when either is absent.
 *
 * Not limited to `enabled`, because enabling a service is not always enough to
 * deploy it: the host rejects a data service turned on without a `dialect`,
 * while the template contract rejects a `dialect` on a service left off. Only a
 * pack can satisfy both, and only if it can write more than one property.
 *
 * With `preserveExisting`, a property already carrying a different value is left
 * alone and reported, matching how kit files and scripts are treated on a
 * re-apply. `dialect` is the case that matters: silently resetting a Builder's
 * `postgresql` back to `mssql` would point the next deploy at another database.
 *
 * @returns `{ text, preserved }` — `preserved` is the value that was kept, or
 * `undefined` when the property was written.
 */
function writeServiceProperty(
  text,
  service,
  property,
  value,
  preserveExisting = false
) {
  const lines = text.split(/\r?\n/);
  const functionsAuth = service === 'functions' && property === 'auth';
  if (
    functionsAuth &&
    (value === null ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).length !== 1 ||
      value.type !== 'application')
  ) {
    throw new Error(
      'Pack services.functions.auth.type must be the mapping {"type":"application"}.'
    );
  }
  // This writer patches block-style YAML line by line. Every other way of
  // spelling the same data — a flow mapping, an anchor, a tag, an alias — reads
  // as "no such block" and would get a second key appended. Enumerating those
  // forms is a losing game, so prove the target *is* a plain block mapping and
  // refuse whenever that cannot be shown.
  const refuse = (line, label) => {
    if (functionsAuth) refuseFunctionsAuth();
    throw new Error(
      `Cannot update rayfin.yml: \`${line.trim()}\` is not a plain block mapping.\n` +
        `   This writer edits block-style YAML. Rewrite it as an indented block, e.g.\n` +
        `     ${label}:\n       ${property}: …\n` +
        `   then re-run the pack.`
    );
  };
  // A header may carry a trailing comment and nothing else. Anything further —
  // `{`, `[`, `&anchor`, `!tag`, `*alias`, a scalar — is not a block to patch.
  const assertPlainHeader = (idx, label) => {
    if (idx === -1) return;
    const after = lines[idx].slice(lines[idx].indexOf(':') + 1).trim();
    if (after !== '' && !after.startsWith('#')) refuse(lines[idx], label);
  };
  const servicesIdx = lines.findIndex((l) => /^services:/.test(l));
  assertPlainHeader(servicesIdx, 'services');
  // Comments carry no indentation semantics in YAML, so one at column zero sits
  // *inside* the block it appears in. Only a real top-level key closes `services:`.
  const isComment = (line) => /^\s*#/.test(line);
  // A service header only counts inside the `services:` block. Searching the
  // whole file would match `  <service>:` nested under some other top-level key
  // and then refuse — or edit — a line that is none of our business.
  const servicesEnd =
    servicesIdx === -1
      ? -1
      : (() => {
          const rel = lines
            .slice(servicesIdx + 1)
            .findIndex((l) => /^\S/.test(l) && !isComment(l));
          return rel === -1 ? lines.length : servicesIdx + 1 + rel;
        })();
  const findInServices = (re) =>
    servicesIdx === -1
      ? -1
      : lines.findIndex(
          (l, i) => i > servicesIdx && i < servicesEnd && re.test(l)
        );
  assertPlainHeader(
    findInServices(new RegExp(`^  ${escapeRe(service)}:`)),
    service
  );
  // Trailing comments are valid on these headers, so they must not stop the match.
  const svcRe = new RegExp(`^  ${escapeRe(service)}:\\s*(?:#.*)?$`);
  // Match with or without a value, so a valueless `dialect:` is filled in rather
  // than duplicated. `(?:\s|$)` stops it matching a longer property name.
  const propertyRe = new RegExp(`^ {4}${escapeRe(property)}:(?:\\s|$)`);
  const svcIdx = findInServices(svcRe);
  const rendered = functionsAuth
    ? ['    auth:', '      type: "application"']
    : [`    ${property}: ${renderYamlScalar(value)}`];
  if (
    functionsAuth &&
    hasApplicationFunctionsAuth(lines, servicesIdx, servicesEnd, svcIdx)
  ) {
    // Auth is a contract, not a seed: even --force-seeds keeps a valid authored
    // mapping and refuses an invalid one rather than silently migrating it.
    return { text };
  }

  if (svcIdx === -1) {
    // `servicesIdx` from above is safe to reuse: `assertPlainHeader` has already
    // proved any match there is a bare header, optionally with a comment.
    const block = [`  ${service}:`, ...rendered];
    if (servicesIdx === -1)
      return { text: [...lines, 'services:', ...block].join('\n') };
    lines.splice(servicesIdx + 1, 0, ...block);
    return { text: lines.join('\n') };
  }

  // Append rather than insert at the top, so a pack writing several properties
  // leaves them in the order it declared them.
  let endIdx = svcIdx;
  for (let j = svcIdx + 1; j < lines.length; j++) {
    const line = lines[j];
    if (line.trim() === '') continue;
    // Comments sit at any column in YAML. Skipping without advancing `endIdx`
    // keeps one attached to the line below it rather than being written over.
    if (isComment(line)) continue;
    // Dedent to another top-level service (<=2-space indent) ends this block.
    if (/^ {0,2}\S/.test(line)) break;
    // Only the property level is this writer's business. Deeper lines are some
    // property's own value — a nested map, a sequence — and may take any shape.
    if (/^ {4}\S/.test(line) && !/^ {4}[\w.-]+:(?:\s|$)/.test(line))
      refuse(line, service);
    if (propertyRe.test(line)) {
      const current = line.slice(line.indexOf(':') + 1).trim();
      // A placeholder is not a choice worth keeping: the pack still enables the
      // service, and the host would reject the deploy for the empty value.
      if (
        preserveExisting &&
        !isSemanticallyEmpty(current) &&
        current !== renderYamlScalar(value)
      ) {
        return { text: lines.join('\n'), preserved: current };
      }
      lines.splice(j, 1, ...rendered);
      return { text: lines.join('\n') };
    }
    endIdx = j;
  }
  lines.splice(endIdx + 1, 0, ...rendered);
  return { text: lines.join('\n') };
}

/** Set a service scalar or the Functions application-auth mapping. */
export function setServiceProperty(text, service, property, value) {
  return writeServiceProperty(text, service, property, value).text;
}

function readPackDefinitions(skillsRoot = SKILLS) {
  const definitions = [];
  for (const directory of readdirSync(skillsRoot).sort()) {
    const packDirectory = join(skillsRoot, directory);
    const manifestPath = join(packDirectory, 'pack.json');
    if (!existsSync(manifestPath)) continue;

    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Malformed pack manifest: ${manifestPath}\n  ${detail}`);
    }
    if (
      manifest === null ||
      typeof manifest !== 'object' ||
      Array.isArray(manifest)
    ) {
      throw new Error(
        `Malformed pack manifest: ${manifestPath}\n  Expected a JSON object.`
      );
    }

    definitions.push({
      directory,
      packDirectory,
      manifest,
      name: manifest.name ?? directory,
    });
  }
  return definitions.sort(
    (a, b) =>
      a.name.localeCompare(b.name) || a.directory.localeCompare(b.directory)
  );
}

function findPackDefinition(pack, definitions) {
  return (
    definitions.find((definition) => definition.directory === pack) ??
    definitions.find((definition) => definition.name === pack)
  );
}

/**
 * Resolve a command-facing pack name to its skill directory.
 *
 * Most packs use the same name for both. A capability may use a concise command
 * name while keeping a more descriptive skill name, such as the `functions`
 * pack implemented by the `functions-capability` skill.
 */
export function resolvePackDirectory(pack, skillsRoot = SKILLS) {
  return findPackDefinition(pack, readPackDefinitions(skillsRoot))
    ?.packDirectory;
}

/** Alpha-sort a dependency map for deterministic diffs. */
function sortDeps(map) {
  if (!map) return map;
  return Object.fromEntries(
    Object.keys(map)
      .sort()
      .map((k) => [k, map[k]])
  );
}

/**
 * Where a pack records that its dependencies installed successfully.
 *
 * Inside `node_modules` on purpose: deleting the tree invalidates the claim,
 * which is exactly the intended meaning.
 */
function packInstallMarker(root, pack) {
  return join(root, 'node_modules', '.rayfin-packs', `${pack}.json`);
}

/** A stable fingerprint of the exact dependency set a pack asks for. */
export function depsFingerprint(pinned) {
  return createHash('sha256')
    .update(
      Object.keys(pinned)
        .sort()
        .map((name) => `${name}@${pinned[name]}`)
        .join('\n')
    )
    .digest('hex');
}

/**
 * Whether `npm install` still needs to run, and why.
 *
 * The whole decision lives here so it can be tested without a network or a
 * five-minute install. It turns on a marker written *after* npm exits zero,
 * rather than on inspecting the tree: checking that the pack's direct packages
 * are present cannot see a half-finished install, where those manifests exist
 * but a transitive dependency never arrived. The marker is cleared before every
 * attempted install, so a failure leaves no record at all — not even an older
 * one from a previous success — and the next run tries again.
 */
export function shouldInstallPackDependencies({
  root,
  pack,
  pinned,
  depsChanged,
  dryRun,
  noInstall,
}) {
  if (dryRun) return { install: false, reason: 'dry run' };
  if (noInstall) return { install: false, reason: 'no-install' };
  // Nothing to fetch, and the `rayfinPacks` marker alone would otherwise count
  // as a package.json change.
  if (Object.keys(pinned ?? {}).length === 0)
    return { install: false, reason: 'pack declares no dependencies' };
  if (depsChanged) return { install: true, reason: 'dependencies changed' };
  const marker = packInstallMarker(root, pack);
  if (!existsSync(marker))
    return { install: true, reason: 'no successful install recorded' };
  try {
    const recorded = JSON.parse(readFileSync(marker, 'utf8'));
    return recorded.deps === depsFingerprint(pinned)
      ? { install: false, reason: 'already installed' }
      : {
          install: true,
          reason: 'recorded install is for a different dependency set',
        };
  } catch {
    return { install: true, reason: 'install record is unreadable' };
  }
}

/** Records that this pack's dependencies installed cleanly. */
function recordPackInstall(root, pack, pinned) {
  const marker = packInstallMarker(root, pack);
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(
    marker,
    JSON.stringify({ pack, deps: depsFingerprint(pinned) }, null, 2) + '\n'
  );
}

/**
 * Drops any record of a previous install.
 *
 * Called before every attempted install: a marker describes a tree, and once
 * npm starts that tree no longer matches. Leaving the old one in place lets a
 * failed install inherit an earlier success, which the next run then trusts.
 */
export function clearPackInstall(root, pack) {
  rmSync(packInstallMarker(root, pack), { force: true });
}

/**
 * Install one pack-owned nested dependency tree.
 *
 * The runner is injectable so the process boundary and working directory can
 * be covered without performing a network install in template tests.
 */
export function installPackDirectory({
  root,
  installPath,
  dryRun = false,
  noInstall = false,
  run = spawnSync,
  writeLog = log,
  beforeInstall = () => {},
}) {
  const installDir = resolve(root, installPath);
  const rel = relative(root, installDir);
  if (rel.startsWith('..') || resolve(root, rel) !== installDir) {
    return {
      ok: false,
      error: `install directory must stay inside the app: ${installPath}`,
    };
  }
  if (dryRun) {
    writeLog(`  - would install dependencies in ${installPath}`);
    return { ok: true, status: 'dry-run', installDir };
  }
  if (noInstall) {
    writeLog(
      `  - skipped dependency install in ${installPath} (--no-install; run ` +
        `\`npm --prefix ${installPath} install --ignore-scripts --no-audit --no-fund\`)`
    );
    return { ok: true, status: 'skipped', installDir };
  }

  writeLog(`\n> Installing dependencies in ${installPath}...`);
  beforeInstall();
  const result = run('npm install --ignore-scripts --no-audit --no-fund', {
    cwd: installDir,
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    return {
      ok: false,
      status: result.status ?? 1,
      error:
        `dependency install failed in ${installPath} - ` +
        (result.error ? `${result.error.message}; ` : '') +
        'resolve the error above, then re-run.',
    };
  }
  return { ok: true, status: 'installed', installDir };
}

/**
 * Copies a directory, leaving any destination that already exists alone.
 *
 * A pack is idempotent, so re-applying it must not undo work done since the
 * first run. Configuration is the case that matters: connecting a data source
 * writes into files the app keeps, and copying over one of those would silently
 * disconnect the app.
 *
 * `force` takes the pack's version back, which is what the message about
 * `--force-seeds` promises. A destination whose content already matches the
 * source is reported through neither callback: it is not a customization, and
 * saying so would send people to merge files that are already identical.
 *
 * `onFile` is called for a file that was written, `onSkip` for one preserved.
 */
function copyDir(fromDir, toDir, onFile, dryRun, onSkip, force, transaction) {
  for (const name of readdirSync(fromDir)) {
    const from = join(fromDir, name);
    const to = join(toDir, name);
    if (statSync(from).isDirectory())
      copyDir(from, to, onFile, dryRun, onSkip, force, transaction);
    else if (existsSync(to) && !force) {
      const same =
        seedDigest(readFileSync(to, 'utf8')) ===
        seedDigest(readFileSync(from, 'utf8'));
      if (!same) onSkip(to);
    } else {
      if (!dryRun) {
        transaction.copy(from, to);
      }
      onFile(to);
    }
  }
}

/**
 * Content digest used to recognize an untouched base seed. Line endings and a
 * leading BOM are normalized so a Windows checkout hashes the same as a Linux
 * one.
 */
export function seedDigest(text) {
  return createHash('sha256')
    .update(text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'))
    .digest('hex');
}

/**
 * Decide what to do with a seed file — one the pack wants to plant over the base
 * starter, but which the user may already own.
 *
 * A seed is only replaced when we can *prove* the destination is still the
 * untouched base starter: it is missing, or its content digest matches one of
 * the base revisions the pack recorded in `seedReplaceIfPristine`. Anything else
 * is the user's file and is preserved. (Same model as dpkg conffile handling.)
 *
 * This must not be inferred from a substring. A marker like `HomePage` or
 * `./main.css` survives exactly the edits worth protecting — wiring
 * `AuthProvider` into `main.tsx` keeps the `./main.css` import — so a substring
 * test reports "pristine" for a customized file and silently destroys it.
 *
 * @returns {'write'|'preserve'|'current'} `current` means the pack's own seed is
 *   already in place, so a re-run is a silent no-op.
 */
export function classifySeed(
  entry,
  destText,
  { force = false, sourceText } = {}
) {
  if (destText === undefined) return 'write';
  if (
    sourceText !== undefined &&
    seedDigest(destText) === seedDigest(sourceText)
  ) {
    return 'current';
  }
  if (force) return 'write';

  const pristine = entry.seedReplaceIfPristine;
  if (pristine === undefined) return 'preserve';

  const digests = Array.isArray(pristine) ? pristine : [pristine];
  return digests.includes(seedDigest(destText)) ? 'write' : 'preserve';
}

function main(transaction) {
  const { pack, flags } = parseArgs(process.argv.slice(2));
  if (!pack) {
    warn(
      'Usage: node scripts/scaffold.mjs <pack> [--no-install] [--dry-run] [--force-seeds]'
    );
    process.exit(1);
  }

  let packDefinitions;
  try {
    packDefinitions = readPackDefinitions();
  } catch (error) {
    warn(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  const packDefinition = findPackDefinition(pack, packDefinitions);
  if (!packDefinition) {
    warn(`No manifest for pack "${pack}"`);
    warn(
      'Available packs:',
      packDefinitions.map((definition) => definition.name).join(', ') ||
        '(none)'
    );
    process.exit(1);
  }

  const packDir = packDefinition.packDirectory;
  const manifest = packDefinition.manifest;
  const packDirectory = packDefinition.directory;
  const canonicalPack = packDefinition.name;
  const dryRun = !!flags['dry-run'];
  const requestedAlias = pack === canonicalPack ? '' : ` (via ${pack})`;
  log(
    `\n> Scaffolding pack: ${canonicalPack}${requestedAlias}${dryRun ? ' (dry run)' : ''}`
  );
  if (manifest.description) log(`  ${manifest.description}`);

  // Read package.json first: whether this pack has run here before decides
  // both which scripts may be replaced and, below, which rayfin.yml settings
  // are the Builder's rather than the pack's.
  const pkgPath = join(ROOT, 'package.json');
  const pkgBefore = readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(pkgBefore);
  const dependencyPkgPath = resolve(
    ROOT,
    manifest.packageJson ?? 'package.json'
  );
  const dependencyPkgRelative = relative(ROOT, dependencyPkgPath);
  if (
    dependencyPkgRelative.startsWith('..') ||
    resolve(ROOT, dependencyPkgRelative) !== dependencyPkgPath
  ) {
    warn(`Pack packageJson must stay inside the app: ${manifest.packageJson}`);
    process.exit(1);
  }
  if (!existsSync(dependencyPkgPath)) {
    warn(`Pack packageJson does not exist: ${dependencyPkgRelative}`);
    process.exit(1);
  }
  const dependencyPkgBefore =
    dependencyPkgPath === pkgPath
      ? pkgBefore
      : readFileSync(dependencyPkgPath, 'utf8');
  const dependencyPkg =
    dependencyPkgPath === pkgPath ? pkg : JSON.parse(dependencyPkgBefore);

  // `match:<pkg>` means "pin this to whatever the app already pins for <pkg>".
  // Rayfin packages ship as one version line. A literal here would be correct on
  // the day it was written and silently skewed one release later, which surfaces
  // as confusing cross-package type errors rather than an install failure.
  const dependencySources = [{ path: 'package.json', manifest: pkg }];
  const workspacePatterns = Array.isArray(pkg.workspaces)
    ? pkg.workspaces
    : (pkg.workspaces?.packages ?? []);
  for (const pattern of workspacePatterns) {
    if (typeof pattern !== 'string' || !pattern.endsWith('/*')) continue;
    const workspaceRoot = resolve(ROOT, pattern.slice(0, -2));
    const rel = relative(ROOT, workspaceRoot);
    if (rel.startsWith('..') || resolve(ROOT, rel) !== workspaceRoot) continue;
    if (!existsSync(workspaceRoot)) continue;
    for (const member of readdirSync(workspaceRoot).sort()) {
      const memberPath = join(workspaceRoot, member, 'package.json');
      if (!existsSync(memberPath)) continue;
      dependencySources.push({
        path: relative(ROOT, memberPath).replace(/\\/g, '/'),
        manifest: JSON.parse(readFileSync(memberPath, 'utf8')),
      });
    }
  }
  const resolveVersion = (name, version) => {
    if (typeof version !== 'string' || !version.startsWith('match:')) {
      return version;
    }
    const peer = version.slice('match:'.length);
    const matches = dependencySources.flatMap(({ path, manifest }) =>
      ['dependencies', 'devDependencies'].flatMap((kind) => {
        const found = manifest[kind]?.[peer];
        return found === undefined
          ? []
          : [
              {
                path: `${path}#${kind}`,
                manifestDirectory: dirname(resolve(ROOT, path)),
                version: found,
              },
            ];
      })
    );
    const versions = [...new Set(matches.map((match) => match.version))];
    if (versions.length === 0) {
      throw new Error(
        `Pack "${pack}" pins a dependency to "${version}", but this app has no ` +
          `"${peer}" dependency to match against.`
      );
    }

    if (versions.length > 1) {
      const details = matches
        .map((match) => `${match.path} (${match.version})`)
        .join(', ');
      throw new Error(
        `Pack "${pack}" pins a dependency to "${version}", but this app declares ` +
          `conflicting versions for "${peer}": ${details}.`
      );
    }

    // During monorepo development, `rayfin init` rewrites sibling Rayfin
    // dependencies to `file:` paths. Reusing the peer's path verbatim would
    // install that peer under the new package's name (for example, core as
    // storage). Find the requested package beside the matched peer instead.
    const found = versions[0];
    if (found.startsWith('file:')) {
      const peerDir = resolve(
        matches[0].manifestDirectory,
        found.slice('file:'.length)
      );
      const siblings = readdirSync(dirname(peerDir), { withFileTypes: true });
      for (const sibling of siblings) {
        if (!sibling.isDirectory()) continue;
        const candidate = join(dirname(peerDir), sibling.name);
        const packagePath = join(candidate, 'package.json');
        if (!existsSync(packagePath)) continue;
        const candidatePackage = JSON.parse(readFileSync(packagePath, 'utf8'));
        if (candidatePackage.name === name) {
          return `file:${relative(dirname(dependencyPkgPath), candidate).replace(/\\/g, '/')}`;
        }
      }
      throw new Error(
        `Pack "${pack}" could not find local package "${name}" beside "${peer}".`
      );
    }
    return found;
  };
  const resolveAll = (deps) =>
    Object.fromEntries(
      Object.entries(deps ?? {}).map(([name, version]) => [
        name,
        resolveVersion(name, version),
      ])
    );
  const resolvedDeps = {
    dependencies: resolveAll(manifest.dependencies),
    devDependencies: resolveAll(manifest.devDependencies),
  };
  // Whether this pack has run here before. This separates the two meanings of
  // "this script is not the pack's version": before the first apply it is the
  // base starter and replacing it is the entire point, while afterwards it is
  // someone's edit and replacing it destroys work.
  //
  // The pack records itself, rather than being inferred from files it ships.
  // Inference was wrong in both directions: pinned versions alone read a routine
  // dependency bump as "never applied", and any kit file existing read a file
  // authored *before* the pack as "already applied" - which left `build` bare,
  // so the app deployed without the pack's stages ever running. A marker cannot
  // be created by accident.
  const pinned = {
    ...resolvedDeps.dependencies,
    ...resolvedDeps.devDependencies,
  };
  const recordedPacks = Array.isArray(pkg.rayfinPacks) ? pkg.rayfinPacks : [];
  const applied = [
    ...new Set(
      recordedPacks.map((name) => {
        return findPackDefinition(name, packDefinitions)?.name ?? name;
      })
    ),
  ].sort();
  const depsMatch =
    Object.keys(pinned).length > 0 &&
    Object.entries(pinned).every(
      ([name, version]) =>
        dependencyPkg.dependencies?.[name] === version ||
        dependencyPkg.devDependencies?.[name] === version
    );
  // `depsMatch` remains as a fallback for apps scaffolded before the marker
  // existed, so their customizations are not clobbered on the next apply.
  const alreadyApplied = applied.includes(canonicalPack) || depsMatch;
  const nextApplied = applied.includes(canonicalPack)
    ? [...applied]
    : [...applied, canonicalPack].sort();

  // 1) rayfin.yml service flags
  const svcEdits = manifest.rayfin?.services ?? {};
  const svcNames = Object.keys(svcEdits);
  const preservedSettings = [];
  if (svcNames.length) {
    const ymlPath = join(ROOT, 'rayfin', 'rayfin.yml');
    let yml = readFileSync(ymlPath, 'utf8');
    for (const name of svcNames) {
      if (name === 'functions' && Object.hasOwn(svcEdits[name] ?? {}, 'auth')) {
        // Validate authored auth before scalar edits can obscure its shape.
        // Leave insertion to the loop below to keep manifest property order.
        writeServiceProperty(yml, name, 'auth', svcEdits[name].auth);
      }
      for (const [property, value] of Object.entries(svcEdits[name] ?? {})) {
        // `enabled` is the switch the pack exists to flip; everything else is
        // the Builder's configuration. Not gated on whether the pack has run
        // before — an app configured by hand has no marker, so its first apply
        // would otherwise reset the choice.
        const preserveExisting =
          property !== 'enabled' && !flags['force-seeds'];
        const result = writeServiceProperty(
          yml,
          name,
          property,
          value,
          preserveExisting
        );
        yml = result.text;
        if (result.preserved !== undefined) {
          preservedSettings.push({
            path: `${name}.${property}`,
            kept: result.preserved,
            packValue: value,
          });
          continue;
        }
        log(
          `  - rayfin.yml: ${name}.${property} = ${
            typeof value === 'object' ? JSON.stringify(value) : String(value)
          }`
        );
      }
    }
    if (!dryRun) transaction.write(ymlPath, yml);
    for (const { path, kept, packValue } of preservedSettings) {
      log(
        `  - rayfin.yml: kept your ${path} = ${kept} (pack ships ${packValue})`
      );
    }
  }

  // 2) package.json deps + scripts

  let depCount = 0;
  for (const kind of ['dependencies', 'devDependencies']) {
    const add = manifest[kind] ? resolvedDeps[kind] : undefined;
    if (!add) continue;
    dependencyPkg[kind] = dependencyPkg[kind] ?? {};
    for (const [name, version] of Object.entries(add)) {
      if (dependencyPkg[kind][name] !== version) depCount++;
      dependencyPkg[kind][name] = version;
    }
    dependencyPkg[kind] = sortDeps(dependencyPkg[kind]);
  }
  const preservedScripts = [];
  if (manifest.scripts) {
    for (const [name, cmd] of Object.entries(manifest.scripts)) {
      if (manifest.scriptStages?.[name] !== undefined) continue;
      const current = pkg.scripts?.[name];
      if (current === cmd) continue;
      if (alreadyApplied && current !== undefined && !flags['force-seeds']) {
        preservedScripts.push({ name, cmd });
        continue;
      }
      pkg.scripts = pkg.scripts ?? {};
      pkg.scripts[name] = cmd;
      log(`  - package.json script: ${name}`);
    }
  }
  const stageNames = new Set(
    packDefinitions.flatMap((definition) =>
      Object.keys(definition.manifest.scriptStages ?? {})
    )
  );
  for (const name of stageNames) {
    const knownStages = new Set();
    const selectedStages = [];
    for (const definition of packDefinitions) {
      const stages = definition.manifest.scriptStages?.[name] ?? [];
      for (const stage of stages) knownStages.add(stage);
      if (nextApplied.includes(definition.name)) selectedStages.push(...stages);
    }
    const current = pkg.scripts?.[name];
    if (current === undefined && selectedStages.length === 0) continue;
    const currentCommand = current ?? '';

    pkg.rayfinScriptBases = pkg.rayfinScriptBases ?? {};
    if (pkg.rayfinScriptBases[name] === undefined) {
      pkg.rayfinScriptBases[name] = currentCommand
        .split(/\s+&&\s+/u)
        .filter((stage) => !knownStages.has(stage))
        .join(' && ');
    }
    const recordedBaseStages = pkg.rayfinScriptBases[name]
      .split(/\s+&&\s+/u)
      .filter(Boolean);
    const currentBaseStages =
      current === undefined
        ? []
        : current
            .split(/\s+&&\s+/u)
            .filter((stage) => stage && !knownStages.has(stage));
    const baseStages = flags['force-seeds']
      ? recordedBaseStages
      : currentBaseStages;
    const composed = [...new Set([...selectedStages, ...baseStages])].join(
      ' && '
    );
    if (currentCommand === composed) continue;
    if (alreadyApplied && current !== undefined && !flags['force-seeds']) {
      preservedScripts.push({ name, cmd: composed });
      continue;
    }
    pkg.scripts = pkg.scripts ?? {};
    pkg.scripts[name] = composed;
    log(`  - package.json composed script: ${name}`);
  }
  if (JSON.stringify(recordedPacks) !== JSON.stringify(nextApplied)) {
    pkg.rayfinPacks = nextApplied;
  }
  const pkgAfter = JSON.stringify(pkg, null, 2) + '\n';
  const dependencyPkgAfter =
    dependencyPkgPath === pkgPath
      ? pkgAfter
      : JSON.stringify(dependencyPkg, null, 2) + '\n';
  const pkgChanged =
    pkgAfter !== pkgBefore || dependencyPkgAfter !== dependencyPkgBefore;
  if (!dryRun) {
    if (pkgAfter !== pkgBefore) transaction.write(pkgPath, pkgAfter);
    if (
      dependencyPkgPath !== pkgPath &&
      dependencyPkgAfter !== dependencyPkgBefore
    ) {
      transaction.write(dependencyPkgPath, dependencyPkgAfter);
    }
  }
  log(
    `  - ${dependencyPkgRelative || 'package.json'}: ${depCount} dependency change(s)`
  );
  if (preservedScripts.length) {
    log(
      "\n  Kept your customized script(s) — merge the pack's version in by hand:"
    );
    for (const s of preservedScripts) log(`    - ${s.name}  <-  ${s.cmd}`);
    log('    (re-run with --force-seeds to overwrite instead)');
  }

  // 3) copy kit files
  let copied = 0;
  const staleBuildInfo = new Set();
  const markSourceChanged = (path) => {
    const normalized = path.replace(/\\/g, '/');
    const member = normalized.match(/^packages\/([^/]+)\//u)?.[1];
    if (member) {
      staleBuildInfo.add(join(ROOT, 'packages', member, '.tsbuildinfo'));
    } else if (normalized.startsWith('rayfin/')) {
      staleBuildInfo.add(join(ROOT, 'rayfin', '.temp', 'rayfin.tsbuildinfo'));
    }
  };
  const preserved = [];
  const legacySeeds = [];
  for (const entry of manifest.copy ?? []) {
    const variant = entry.fromVariants?.find((candidate) =>
      candidate.whenPacks.every((name) => applied.includes(name))
    );
    const fromPath = variant?.from ?? entry.from;
    const from = join(packDir, fromPath);
    const to = join(ROOT, entry.to);
    if (!existsSync(from)) {
      warn(`  ! missing source: ${fromPath}`);
      continue;
    }
    // Initialization-only files are handed to another tool after the pack
    // creates them. `packages/frontend/src/lib/connectors.ts`, for example,
    // becomes CLI-generated
    // state after `connector add`; a pack re-apply must neither call that a user
    // customization nor erase it when `--force-seeds` is used.
    if (entry.initializationOnly === true && existsSync(to)) {
      continue;
    }
    // Seed files plant the pack's starter over the base one, but never clobber a
    // file the user has made their own.
    const isSeed =
      entry.seedReplaceIfPristine !== undefined ||
      entry.seedReplaceIfContains !== undefined;
    if (isSeed) {
      const destText = existsSync(to) ? readFileSync(to, 'utf8') : undefined;
      const action = classifySeed(entry, destText, {
        force: !!flags['force-seeds'],
        sourceText: readFileSync(from, 'utf8'),
      });
      if (action === 'current') continue;
      if (action === 'preserve') {
        preserved.push({
          to: entry.to,
          from: `.agents/skills/${packDirectory}/${fromPath}`,
        });
        if (entry.seedReplaceIfPristine === undefined)
          legacySeeds.push(entry.to);
        continue;
      }
      if (!dryRun) {
        transaction.copy(from, to);
      }
      copied++;
      markSourceChanged(entry.to);
      continue;
    }
    if (statSync(from).isDirectory()) {
      copyDir(
        from,
        to,
        (written) => {
          copied++;
          markSourceChanged(relative(ROOT, written));
        },
        dryRun,
        (skipped) =>
          preserved.push({
            to: relative(ROOT, skipped).replace(/\\/g, '/'),
            from: `.agents/skills/${packDirectory}/${fromPath}`,
          }),
        !!flags['force-seeds'],
        transaction
      );
    } else if (existsSync(to) && !flags['force-seeds']) {
      // Already there: leave it. Re-applying a pack must not undo configuration
      // or edits made since the first run. An identical file is not a
      // customization, so it is not reported as one.
      const same =
        seedDigest(readFileSync(to, 'utf8')) ===
        seedDigest(readFileSync(from, 'utf8'));
      if (!same)
        preserved.push({
          to: entry.to,
          from: `.agents/skills/${packDirectory}/${fromPath}`,
        });
    } else {
      if (!dryRun) {
        transaction.copy(from, to);
      }
      copied++;
      markSourceChanged(entry.to);
    }
  }
  log(`  - copied ${copied} file(s)`);

  // Adding sources to a referenced TypeScript project leaves its incremental
  // build stale, and `tsc -b` then trusts the old stamp and fails with TS6305.
  // A re-apply that preserved everything wrote nothing, so it leaves stamps alone.
  if (!dryRun) {
    for (const stamp of staleBuildInfo) {
      if (!existsSync(stamp)) continue;
      transaction.remove(stamp);
      log(
        `  - cleared stale ${relative(ROOT, stamp).replace(/\\/g, '/')} build info`
      );
    }
  }

  if (legacySeeds.length) {
    warn(
      `  ! ${legacySeeds.join(', ')}: "seedReplaceIfContains" is no longer honored — ` +
        'a substring cannot prove a file is unmodified. Record the base digest in ' +
        '"seedReplaceIfPristine" instead (see scripts/pack-manifest.md). Kept your file.'
    );
  }

  // A preserved seed is not a no-op: the pack's own version carries providers the
  // rest of the kit depends on, so say exactly what still needs merging.
  if (preserved.length) {
    log(
      "\n  Kept your customized file(s) — merge the pack's version in by hand:"
    );
    for (const p of preserved) log(`    - ${p.to}  <-  ${p.from}`);
    log('    (re-run with --force-seeds to overwrite instead)');
  }

  // 4) install — the dependencies this pack added, with `npm install`. Skipped
  //    when nothing changed, so re-applying a pack over an up-to-date tree costs
  //    nothing.
  const decision = shouldInstallPackDependencies({
    root: ROOT,
    pack: canonicalPack,
    pinned,
    depsChanged: depCount > 0,
    dryRun,
    noInstall: !!flags['no-install'],
  });
  const beforeInstall = () => {
    // npm may have changed the installed tree even when file rollback succeeds.
    clearPackInstall(ROOT, canonicalPack);
    transaction.installStarted = true;
  };
  if (dryRun) {
    log('\n(dry run - nothing written, nothing installed)');
  } else if (flags['no-install']) {
    log(
      '\n(--no-install - run `npm install --ignore-scripts --no-audit --no-fund` to fetch the new dependencies)'
    );
  } else if (!decision.install) {
    log(`\n(${decision.reason} - skipping install)`);
  } else {
    log('\n> Installing dependencies...');
    // Invalidate first. From here until npm exits zero there is no trustworthy
    // record of this tree, and a stale marker from an earlier success would
    // otherwise survive a failure and make the next run skip the repair.
    beforeInstall();
    // Single-string command with shell:true keeps this cross-platform (cmd.exe on
    // Windows, /bin/sh elsewhere) and avoids Node's DEP0190 args+shell warning.
    // `--ignore-scripts` matches how the host plugin installs: a pack is applied
    // before policy validation gets to look at anything, so package lifecycle
    // scripts must not run first.
    const res = spawnSync('npm install --ignore-scripts --no-audit --no-fund', {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
    });
    if (res.status !== 0) {
      throw new PackInstallError(
        'dependency install failed - ' +
          (res.error ? `${res.error.message}; ` : '') +
          'resolve the error above, then re-run.',
        res.status ?? 1
      );
    }
  }

  for (const installPath of manifest.installDirectories ?? []) {
    const result = installPackDirectory({
      root: ROOT,
      installPath,
      dryRun,
      noInstall: !!flags['no-install'],
      beforeInstall,
    });
    if (!result.ok) {
      throw new PackInstallError(result.error, result.status ?? 1);
    }
  }

  // Legacy nested installs must succeed too before this pack can be trusted.
  if (transaction.installStarted && Object.keys(pinned).length > 0) {
    recordPackInstall(ROOT, canonicalPack, pinned);
  }

  if (Array.isArray(manifest.next) && manifest.next.length) {
    log('\n[done] Pack ready. Next, read these skills as you build:');
    for (const s of manifest.next) log(`  -> .agents/skills/${s}/SKILL.md`);
  } else {
    log('\n[done] Pack ready.');
  }
}

// Only run when invoked directly, so tests can import the helpers above.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const transaction = createPackTransaction(ROOT);
  try {
    main(transaction);
  } catch (error) {
    warn(`\n! ${error instanceof Error ? error.message : String(error)}`);
    transaction.rollback();
    if (transaction.installStarted) {
      warn(
        '\n! node_modules and installer-written lockfiles were not rolled back. ' +
          'After reconciling any rollback conflicts and resolving the install error, ' +
          'retry the pack, or run `npm install --ignore-scripts --no-audit --no-fund` ' +
          'from the app root to reconcile dependencies with the restored manifests. ' +
          'Re-run your app checks before continuing.'
      );
    }
    process.exitCode = error instanceof PackInstallError ? error.status : 1;
  }
}
