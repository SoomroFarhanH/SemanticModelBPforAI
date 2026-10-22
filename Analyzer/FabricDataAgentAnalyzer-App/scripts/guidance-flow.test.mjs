import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function lineCount(text) {
  return text.trimEnd().split('\n').length;
}

test('the start path stays compact and routes to workspace anchors', () => {
  const agents = read('AGENTS.md');
  const router = read('.agents/skills/capability-router/SKILL.md');
  const guidance = `${agents}\n${router}`;

  assert.ok(lineCount(agents) < 190, 'AGENTS.md regrew into a full handbook');
  assert.ok(
    lineCount(router) < 140,
    'capability-router regrew into a second handbook'
  );

  for (const required of [
    'npm run pack:add -- analytics',
    'npm run pack:add -- visuals',
    'npm run pack:add -- data-modeling',
    'npm run pack:add -- connectors',
    'npm run pack:add -- functions',
    'packages/frontend/src/lib/connectors.ts',
    'packages/data/src/Item.ts',
    'packages/shared/src/index.ts',
    'packages/functions/src/function_app.ts',
    'one pack per invocation',
    'serially',
  ]) {
    assert.ok(
      guidance.includes(required),
      `missing start-path contract: ${required}`
    );
  }
});

test('guidance follows the committed workspace manifests', () => {
  const agents = read('AGENTS.md');
  const router = read('.agents/skills/capability-router/SKILL.md');
  const analyticsPack = readJson('.agents/skills/analytics/pack.json');
  const connectorsPack = readJson('.agents/skills/connectors/pack.json');
  const functionsPack = readJson(
    '.agents/skills/functions-capability/pack.json'
  );
  const rootManifest = readJson('package.json');

  assert.deepEqual(rootManifest.workspaces, ['packages/*']);
  assert.equal(analyticsPack.packageJson, 'packages/frontend/package.json');
  assert.equal(connectorsPack.packageJson, 'packages/frontend/package.json');
  assert.equal(connectorsPack.rayfin, undefined);
  assert.deepEqual(
    connectorsPack.copy.map(({ to }) => to),
    [
      'packages/frontend/src/lib/connectors.ts',
      'packages/frontend/src/lib/rayfin-client.ts',
    ]
  );
  assert.doesNotMatch(
    connectorsPack.description,
    /commands? (?:are )?unlocked|services\.connectors/iu
  );
  assert.equal(
    functionsPack.rayfin.services.functions.path,
    'packages/functions'
  );
  assert.match(agents, /npm workspace root/iu);
  assert.match(router, /packages\/frontend\/package\.json/iu);
  assert.match(router, /packages\/data.*packages\/shared/isu);
  assert.doesNotMatch(
    `${agents}\n${router}`,
    /rayfin\/data\/Item\.ts|rayfin\/functions\/src\/function_app\.ts/iu
  );
});

test('the router documents optional serial no-install consolidation', () => {
  const router = read('.agents/skills/capability-router/SKILL.md');

  assert.match(router, /npm run pack:add -- <name> --no-install.*serially/isu);
  assert.match(router, /npm install --ignore-scripts --no-audit --no-fund/u);
  assert.match(router, /preserved files/iu);
  assert.match(router, /does not write the per-pack success markers/iu);
  assert.match(router, /later ordinary pack reapply may install again/iu);
  assert.match(router, /scaffolder accepts one pack per invocation/iu);
  assert.match(router, /not durable pack caching/iu);
});

test('source routing preserves confirmation and real-versus-sample boundaries', () => {
  const guidance = `${read('AGENTS.md')}\n${read(
    '.agents/skills/capability-router/SKILL.md'
  )}`;

  for (const required of [
    'Never fabricate',
    'verify',
    'Ask',
    'sample data',
    'label',
    'semantic-model app needs',
  ]) {
    assert.match(guidance, new RegExp(required, 'iu'));
  }
});

test('plugin compatibility preserves backend auth without requiring a portal gate', () => {
  const agents = read('AGENTS.md');
  const config = read('rayfin/rayfin.yml');
  const begin = agents.indexOf('<!-- BEGIN RAYFIN COPILOT PLUGIN -->');
  const end = agents.indexOf('<!-- END RAYFIN COPILOT PLUGIN -->');

  assert.ok(begin >= 0, 'missing plugin compatibility start marker');
  assert.ok(end > begin, 'missing plugin compatibility end marker');
  for (const required of [
    '**You own the toolchain.**',
    'keep password authentication disabled.',
    'Talk about the app, not the machinery.',
    'project-installed commands',
    'installed CLI deployment guide',
  ]) {
    assert.ok(
      agents.includes(required),
      `missing plugin invariant: ${required}`
    );
  }

  assert.match(config, /auth:\s+enabled: true\s+fabric:\s+enabled: true/isu);
  assert.match(config, /password:\s+enabled: false/isu);
  assert.match(config, /assetAccess: protected/iu);
  assert.match(agents, /inside and outside the Fabric portal/iu);
  assert.match(agents, /app remains gated on an authenticated session/iu);
  assert.doesNotMatch(
    agents,
    /rayfin_(?:create|validate|deploy)_app|Host plugin path/iu
  );
});

test('analytics permits a runnable shell before exhaustive discovery', () => {
  const agents = read('AGENTS.md');
  const analytics = read('.agents/skills/analytics/SKILL.md');
  const design = read('.agents/skills/app-design/SKILL.md');
  const guidance = `${agents}\n${analytics}\n${design}`;

  assert.match(guidance, /runnable shell/iu);
  assert.match(guidance, /honest loading/iu);
  assert.match(guidance, /bounded|bound the attempts/iu);
  assert.match(guidance, /authentication.*configuration.*query/isu);
  assert.doesNotMatch(analytics, /No app code is written yet/iu);
});

test("analytics routes through the connectors pack's installed client recipe", () => {
  const agents = read('AGENTS.md');
  const analytics = read('.agents/skills/analytics/SKILL.md');
  const router = read('.agents/skills/capability-router/SKILL.md');
  const semanticModelRoute = (guidance, prefix) =>
    guidance.split('\n').find((line) => line.startsWith(prefix)) ?? '';

  assert.match(analytics, /npm run pack:add -- connectors/u);
  assert.match(
    analytics,
    /composes connectors through `ExtendableRayfinClient`/u
  );
  assert.match(
    semanticModelRoute(agents, '| Existing Power BI semantic model |'),
    /pack:add -- connectors.*pack:add -- analytics/u
  );
  assert.match(
    semanticModelRoute(router, '| Read an existing Power BI semantic model |'),
    /pack:add -- connectors.*pack:add -- analytics/u
  );
  assert.doesNotMatch(
    analytics,
    /ConnectorsRayfinClient|assertConnectorRuntimesRegistered/u
  );
  assert.match(
    analytics,
    /npm install -w @rayfin-app\/frontend <printed-packages-and-versions>/u
  );
});

test('Category A connector guidance follows the live catalog and package docs', () => {
  const connectors = read('.agents/skills/connectors/SKILL.md');

  assert.match(
    connectors,
    /`rayfin connector` command group is always available.*requires no pack.*service flag/isu
  );
  assert.match(
    connectors,
    /pack adds the frontend connector SDK.*composable Rayfin client.*`rayfin connector add` owns the top-level `connectors:` configuration/isu
  );
  assert.match(
    connectors,
    /--all-workspaces.*tenant-wide.*--workspace-id <id>.*workspace is known.*Both explicit scopes require `--type`/isu
  );
  assert.match(
    connectors,
    /installed.*@microsoft\/rayfin-connector-fabric-graphql.*rayfin\/connectors\/<alias>\/metadata\.json/isu
  );
  assert.match(connectors, /version-matched.*connector types --json/isu);
  assert.match(
    connectors,
    /fabric-warehouse.*fabric-sqldatabase.*fabric-sqlanalytics/isu
  );
  assert.match(
    connectors,
    /Power BI semantic model.*pack:add -- connectors.*pack:add -- analytics/isu
  );
  assert.match(
    connectors,
    /External API.*pack:add -- functions.*functions-capability/isu
  );
  assert.match(connectors, /connectorType.*ready-to-run `addCommand`/isu);
  assert.match(
    connectors,
    /generated-marker line.*AppConnectorsSchema.*connectorConfigs/isu
  );
  assert.match(connectors, /Category A needs no `connectorRuntimes` entry/iu);
  assert.match(
    connectors,
    /Do not rerun `rayfin connector add --yes`.*placeholder/isu
  );
  assert.match(
    connectors,
    /## Sample the source.*connector inspect.*does not replace deployed browser validation/isu
  );
  assert.match(
    connectors,
    /client\.connectors\.<alias>\.<Entity>.*normal project gates/isu
  );

  for (const stale of [
    /\bfabric-sql\b/u,
    /connector invoke <alias> getSchema/u,
    /connector invoke <alias> executeQuery/u,
    /\brayfin validate\b/u,
    /turns on `services\.connectors`/u,
    /enable the command surface/iu,
    /`--all-workspaces` is required before/iu,
    /and `type` without parsing a table/u,
    /## Prove the source/u,
  ]) {
    assert.doesNotMatch(connectors, stale);
  }
});

test('welcome guidance preserves the starter view module boundary', () => {
  const analytics = read('.agents/skills/analytics/SKILL.md');
  const source = read('packages/frontend/src/EmptyStatePreview.tsx');

  assert.match(analytics, /starter\/welcome view/iu);
  assert.match(analytics, /packages\/frontend\/src\/EmptyStatePreview\.tsx/iu);
  assert.match(analytics, /existing named `EmptyStatePreview` export/iu);
  assert.match(source, /export function EmptyStatePreview\s*\(/u);
  assert.doesNotMatch(analytics, /default export/iu);
  assert.doesNotMatch(analytics, /delete.*EmptyStatePreview/isu);
  assert.doesNotMatch(analytics, /empty-state-preview-world-map/iu);
});

test('welcome cleanup disables packaged source activity without shipping plugin code or flag instructions', () => {
  const readme = read('README.md');
  const app = read('packages/frontend/src/App.tsx');
  assert.match(
    readme,
    /remove `sourceActivity: true`.*`rayfinLocalDev`.*vite\.config\.ts/iu
  );
  assert.match(readme, /App\.spec\.tsx.*Root\.spec\.tsx.*Welcome\.activity/iu);
  assert.match(readme, /Finley\.tsx.*Finley\.css.*Finley\.spec\.tsx/iu);
  assert.match(readme, /@microsoft\/rayfin-local-dev/iu);
  assert.doesNotMatch(readme, /RAYFIN_FEATURE_FLAGS|source-activity.*\.mjs/iu);
  const vite = read('packages/frontend/vite.config.ts');
  assert.match(vite, /rayfinLocalDev\(\{[^}]*sourceActivity: true/u);
  assert.doesNotMatch(vite, /scripts\/source-activity/u);
  assert.doesNotMatch(app, /authentication gate|signed-in users/iu);
});

test('first deployment runs static gates before deployed runtime checks', () => {
  const deployment = read('.agents/skills/app-deployment/SKILL.md');
  const connectors = read('.agents/skills/connectors/SKILL.md');
  const validation = read('.agents/skills/app-validation/SKILL.md');
  const guidance = `${deployment}\n${connectors}`;

  assert.match(deployment, /static gates: typecheck, build, lint/iu);
  assert.match(
    deployment,
    /pre-deploy browser or persistence checks only when.*already support/isu
  );
  assert.match(
    deployment,
    /After deployment succeeds.*browser checks.*persistence/isu
  );
  assert.match(validation, /steps 1 through 5 before the remote write/iu);
  assert.match(
    validation,
    /then run steps 6 and 7 against the\s+Fabric URL produced by that deployment/iu
  );
  assert.match(deployment, /user's confirmation/iu);
  assert.match(
    deployment,
    /rayfin up --json.*status: "success".*not enough.*Inspect `generate` status first/isu
  );
  assert.match(
    deployment,
    /rayfin up --json.*non-interactive.*first deployment.*confirmed target.*--workspace-id <id>.*--workspace <name>.*--workspace-uri <uri>/isu
  );
  assert.match(
    deployment,
    /every connector declared in `rayfin\.yml`.*matching\s+`generate\[\]` result.*missing result.*status: "error".*blocking/isu
  );
  assert.match(
    deployment,
    /Only when.*status: "skipped".*inspect.*`skipReason`.*Category B `non-graphql-connector` skip.*acceptable only when.*installed type contract.*validated separately/isu
  );
  assert.match(
    deployment,
    /Any other skip for a required connector is blocking/iu
  );
  assert.match(
    deployment,
    /`skippedConnectors` summarizes skipped results only.*excludes errors.*cannot reveal a missing `generate\[\]` result/isu
  );
  assert.match(
    deployment,
    /Do not use `skippedConnectors` or warning wording to decide whether a\s+connector succeeded/iu
  );
  assert.doesNotMatch(deployment, /missing-generated-config/u);
  assert.doesNotMatch(deployment, /warning says it was not applied/iu);
  assert.match(
    connectors,
    /Before browser validation.*app-deployment.*overall `rayfin up` success.*required connector.*generated and applied/isu
  );
  const preview = guidance.indexOf('npx rayfin up -n');
  const deployed = guidance.indexOf('npx rayfin up --json', preview);
  const outcome = guidance.indexOf('generate[]', deployed);
  const browser = guidance.indexOf('browser validation', outcome);
  assert.ok(
    preview >= 0 &&
      deployed > preview &&
      outcome > deployed &&
      browser > outcome,
    'preview, JSON deployment, outcome inspection, and browser validation must stay ordered'
  );
  assert.doesNotMatch(deployment, /then run `npx rayfin up`\./u);
  assert.doesNotMatch(
    deployment,
    /overall `status: "success"` (?:proves|means|guarantees)/iu
  );
});

test('validation has one ordered final sequence and keeps typecheck real', () => {
  const agents = read('AGENTS.md');
  const validation = read('.agents/skills/app-validation/SKILL.md');
  const visuals = read('.agents/skills/visuals/SKILL.md');
  const analytics = read('.agents/skills/analytics/SKILL.md');
  const guidance = `${agents}\n${validation}\n${visuals}\n${analytics}`;

  const ordered = [
    'npm run typecheck',
    'npm run build',
    'npm run lint',
    'npm test',
    'validate:visual',
    'Browser',
    'reload',
  ];
  let previous = -1;
  for (const token of ordered) {
    const next = guidance.indexOf(token, previous + 1);
    assert.ok(
      next > previous,
      `validation token is missing or out of order: ${token}`
    );
    previous = next;
  }

  assert.match(guidance, /build.*--noCheck.*does not.*type safety/isu);
  assert.match(guidance, /Do not race typecheck and build/iu);
  assert.match(guidance, /rerun.*affected|rerun that gate/iu);
  assert.match(
    guidance,
    /status: "incomplete".*ok: false.*coverage.*none.*partial.*complete/isu
  );
  assert.match(
    guidance,
    /zero schemas were checked.*validate:visual:preview/isu
  );
  assert.match(
    guidance,
    /some schemas were checked.*exits zero.*no preview flag/isu
  );
  assert.match(
    guidance,
    /Missing or broken Vega-Lite\/AJV tooling.*failed.*preview/isu
  );
  assert.match(
    guidance,
    /records the\s+Fabric route or URL checked.*runtime-built charts/isu
  );
  assert.match(
    guidance,
    /Do not infer browser validation.*validator exit code/isu
  );
});

test('CRUD guidance matches the useCrud and date-only contracts', () => {
  const crud = read('.agents/skills/crud-ui/SKILL.md');

  for (const required of [
    "timeZone: 'UTC'",
    'Promise<void>',
    'not proof',
    'unrelated live-source',
    'default filter',
    'field-by-field',
    'raw `Date`',
    'object',
    'array',
  ]) {
    assert.ok(crud.includes(required), `missing CRUD contract: ${required}`);
  }
});

test('starter cleanup and functions generation stay workspace-scoped', () => {
  const data = read('.agents/skills/data-modeling/SKILL.md');
  const functions = read('.agents/skills/functions-capability/SKILL.md');

  assert.match(data, /remove.*starter.*Item/isu);
  assert.match(data, /packages\/shared\/src\/index\.ts/iu);
  assert.match(functions, /npm run dev.*initial\s+type-generation/isu);
  assert.match(functions, /watches registered function signature edits/iu);
  assert.match(functions, /services\.functions\.path/iu);
  assert.match(functions, /packages\/functions\/src\/types\.ts/iu);
  assert.match(
    functions,
    /Do not run `npx rayfin functions init` in this workspace template/iu
  );
  assert.match(
    functions,
    /npx rayfin init ai-files install --enable skill:rayfin-functions --non-interactive/u
  );
  assert.doesNotMatch(functions, /rayfin\/functions\/src\/types\.ts/iu);
});
