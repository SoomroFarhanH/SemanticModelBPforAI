import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

test('functions guidance uses workspace-aware type generation', () => {
  const skill = read('.agents/skills/functions-capability/SKILL.md');
  const pack = JSON.parse(
    read('.agents/skills/functions-capability/pack.json')
  );
  const installContext = skill.indexOf(
    'npx rayfin init ai-files install --enable skill:rayfin-functions --non-interactive'
  );
  const installedSkill = skill.indexOf(
    'Read `.agents/skills/rayfin-functions/SKILL.md`'
  );
  const author = skill.indexOf('Replace the starter registration');
  const dev = skill.indexOf('`npm run dev` from the workspace root');

  assert.ok(installContext >= 0, 'missing agent context installation command');
  assert.ok(
    installedSkill > installContext,
    'installed skill is read before context installation'
  );
  assert.ok(
    author > installedSkill,
    'function is authored before guidance loads'
  );
  assert.ok(
    dev < author,
    'development typegen starts after function authoring'
  );
  for (const fallback of [
    'does not refresh its skill registry',
    'do not call the skill tool',
    'Do not stop or restart',
    '.agents/skills/rayfin-functions/SKILL.md',
    'services.functions.path',
    'packages/functions/src/types.ts',
    'Never edit',
    'There is no standalone public type-generation command',
    'npm run validate:functions',
    'Never cast `client.functions`',
    'as unknown as',
  ]) {
    assert.ok(skill.includes(fallback), `missing skill fallback: ${fallback}`);
  }
  assert.match(skill, /user's\s+approval for the target workspace/iu);
  assert.doesNotMatch(
    skill,
    /After applying the pack, run `npx rayfin functions init`/iu
  );
  assert.doesNotMatch(skill, /\d+\.\s+Run `npx rayfin functions init`/iu);
  assert.equal(
    pack.scripts['validate:functions'],
    'npm run -w @rayfin-app/shared build && node scripts/validate-functions.mjs'
  );
  for (const name of ['build', 'build:fabric', 'typecheck']) {
    assert.deepEqual(
      pack.scriptStages[name],
      [
        'npm run -w @rayfin-app/shared build',
        'node scripts/validate-functions.mjs',
        'npm run -w @rayfin-app/functions build',
      ],
      `${name} does not build referenced contracts before validation`
    );
  }
  assert.ok(
    pack.copy.some(
      (entry) =>
        entry.from === 'kit/scripts/validate-functions.mjs' &&
        entry.to === 'scripts/validate-functions.mjs'
    ),
    'functions validator is not copied into generated apps'
  );
});

test('generated deployment and secret-bearing files are ignored', () => {
  const gitignore = read('.gitignore');

  for (const required of [
    '.env.local',
    'rayfin/.env',
    'rayfin/.env.secrets',
    'rayfin/.deployments.json',
    'packages/functions/local.settings.json',
    'packages/functions/deploymentdata.json',
  ]) {
    assert.ok(
      gitignore.includes(required),
      `missing gitignore entry: ${required}`
    );
  }
});

test('external API guidance carries the deployed masked-secret contract', () => {
  const skill = read('.agents/skills/external-api-workflows/SKILL.md');

  for (const required of [
    'app-deployment',
    'rayfin/rayfin.yml',
    'npx rayfin secret set THIRD_PARTY_API_KEY',
    'masked prompt',
    'ctx.Secrets.THIRD_PARTY_API_KEY',
    'Deploy the app once',
    'version-matched Rayfin CLI workflow',
    'interactive terminal',
    'start this command there',
    'Do not claim that a terminal was opened',
    'non-interactive shell tool',
    'Wait for the user to confirm',
    'deployed `fabricUrl`',
    'deployed invocation succeeds',
    'provider-neutral request',
    'provider-specific tool only after the user',
    'SECRET_NOT_CONFIGURED',
    'PROVIDER_TIMEOUT',
  ]) {
    assert.match(
      skill,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    );
  }

  const deploy = skill.indexOf('Read `app-deployment`');
  const provision = skill.indexOf('npx rayfin secret set THIRD_PARTY_API_KEY');
  const invoke = skill.indexOf('After the value is provisioned');
  const completion = skill.indexOf('Do not report the workflow complete');

  assert.ok(deploy >= 0, 'missing deployment step');
  assert.ok(provision > deploy, 'secret provisioning must follow deployment');
  assert.ok(invoke > provision, 'deployed invocation must follow provisioning');
  assert.ok(
    completion > invoke,
    'completion gate must follow deployed invocation'
  );
});

test('deployment guidance uses the version-matched CLI lifecycle', () => {
  const agents = read('AGENTS.md');
  const skill = read('.agents/skills/app-deployment/SKILL.md');
  const guidance = `${agents}\n${skill}`;
  const normalizedGuidance = guidance.replace(/\s+/gu, ' ');

  for (const required of [
    'version-matched Rayfin CLI',
    '@microsoft/rayfin-guide/assets/docs/app-backend/deploy.md',
    'npm run typecheck',
    'npx rayfin up -n',
    'npx rayfin up',
    'Do not claim the CLI has validation guarantees',
    'app-validation',
    'does not recreate the validation or deployment implementation',
  ]) {
    assert.ok(
      normalizedGuidance.includes(required),
      `missing deployment routing contract: ${required}`
    );
  }

  assert.doesNotMatch(
    guidance,
    /rayfin_(?:validate|deploy)_app|Host plugin path|actual tool availability/u
  );
  assert.doesNotMatch(
    agents,
    /rather than running `rayfin up` or any deploy command/u
  );
});

test('data-agent guidance carries the application-only MCP contract', () => {
  const skill = read('.agents/skills/fabric-data-agent/SKILL.md');
  const reference = read(
    '.agents/skills/fabric-data-agent/references/mcp-streamable-http.md'
  );
  const guidance = `${skill}\n${reference}`;

  for (const required of [
    'AudienceType.Fabric',
    'ctx.Tokens.Fabric',
    'RayfinContext<AppSchema, AudienceType.Fabric>',
    'initialize',
    'notifications/initialized',
    'tools/list',
    'tools/call',
    'Mcp-Session-Id',
    'text/event-stream',
  ]) {
    assert.ok(
      guidance.includes(required),
      `missing data-agent contract: ${required}`
    );
  }
  assert.match(guidance, /up\s+to\s+10 minutes/u);
});

test('MCP reference is endpoint-neutral and contains no application logging', () => {
  const reference = read(
    '.agents/skills/fabric-data-agent/references/mcp-streamable-http.md'
  );

  assert.match(reference, /endpoint: string/u);
  assert.match(reference, /Authorization: `Bearer \$\{token\}`/u);
  assert.doesNotMatch(reference, /workspaces\/[0-9a-f-]{36}/iu);
  assert.doesNotMatch(reference, /console\.(log|error|warn)/u);
});

test('the default UDF scaffold does not log inputs or return secrets', () => {
  const source = read(
    '.agents/skills/functions-capability/kit/functions/src/function_app.ts'
  );

  assert.doesNotMatch(source, /console\.(log|error|warn)/u);
  assert.doesNotMatch(source, /getSecret/u);
  assert.doesNotMatch(source, /getToken/u);
});

test('the default UDF deploy manifest has no private workspace dependencies', () => {
  const manifest = JSON.parse(
    read('.agents/skills/functions-capability/kit/functions/package.json')
  );
  const runtimeDependencies = Object.keys(manifest.dependencies ?? {});

  assert.deepEqual(
    runtimeDependencies.filter((name) => name.startsWith('@rayfin-app/')),
    []
  );
});
