//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { after, test as nodeTest } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const template = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const validator = path.join(
  template,
  '.agents',
  'skills',
  'functions-capability',
  'kit',
  'scripts',
  'validate-functions.mjs'
);
const workspaces = [];

after(async () => {
  await Promise.all(
    workspaces.map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

const TYPESCRIPT_SOURCE = (() => {
  const require = createRequire(import.meta.url);
  for (const candidate of ['typescript-compiler', 'typescript']) {
    try {
      return path.dirname(require.resolve(`${candidate}/package.json`));
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

function generatedTypes(names) {
  const members = names
    .map(
      (name) =>
        `  ${name}: {\n    input: Record<string, never>;\n    output: string;\n  };`
    )
    .join('\n');
  return `export type AppFunctionsSchema = {\n${members}\n};\n`;
}

async function makeApp(options = {}) {
  const registrations = options.registrations ?? ['helloWorld'];
  const generated = options.generated ?? registrations;
  const frontend =
    options.frontend ?? 'void getRayfinClientSync().functions.helloWorld;\n';
  const functionSource =
    options.functionSource ??
    registrations
      .map((name) => `udf.func('${name}', (): string => '${name}', []);`)
      .join('\n') + '\n';
  const typesSource = options.typesSource ?? generatedTypes(generated);
  const root = await mkdtemp(path.join(os.tmpdir(), 'validate-functions-'));
  workspaces.push(root);
  const functionsDir = path.join(root, 'packages', 'functions');
  const frontendDir = path.join(root, 'packages', 'frontend');
  await Promise.all([
    mkdir(path.join(functionsDir, 'src'), { recursive: true }),
    mkdir(path.join(frontendDir, 'src'), { recursive: true }),
    mkdir(path.join(root, 'node_modules'), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ workspaces: ['packages/*'] }, null, 2) + '\n'
    ),
    writeFile(
      path.join(functionsDir, 'package.json'),
      JSON.stringify({ name: '@rayfin-app/functions' }, null, 2) + '\n'
    ),
    writeFile(
      path.join(frontendDir, 'package.json'),
      JSON.stringify({ name: '@rayfin-app/frontend' }, null, 2) + '\n'
    ),
    writeFile(
      path.join(functionsDir, 'src', 'function_app.ts'),
      functionSource
    ),
    writeFile(path.join(functionsDir, 'src', 'types.ts'), typesSource),
    writeFile(path.join(frontendDir, 'src', 'app.ts'), frontend),
  ]);
  await symlink(
    TYPESCRIPT_SOURCE,
    path.join(root, 'node_modules', 'typescript'),
    'junction'
  );
  return root;
}

async function validate(root) {
  try {
    const result = await run(process.execPath, [validator, '--root', root]);
    return { status: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      status: error.code,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
    };
  }
}

test('passes when authored and generated function names match', async () => {
  const result = await validate(await makeApp());
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).ok, true);
});

test('fails when an authored function is missing from AppFunctionsSchema', async () => {
  const result = await validate(
    await makeApp({
      registrations: ['helloWorld', 'githubRepositoryMetadata'],
      generated: ['helloWorld'],
    })
  );
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, false);
  assert.match(output.failures.join('\n'), /githubRepositoryMetadata/u);
  assert.match(output.failures.join('\n'), /AppFunctionsSchema is stale/u);
});

test('fails when AppFunctionsSchema retains a removed function', async () => {
  const result = await validate(
    await makeApp({
      registrations: ['githubRepositoryMetadata'],
      generated: ['helloWorld', 'githubRepositoryMetadata'],
    })
  );
  assert.equal(result.status, 1);
  assert.match(
    JSON.parse(result.stdout).failures.join('\n'),
    /"helloWorld" remains/u
  );
});

test('ignores function source files excluded by the project tsconfig', async () => {
  const root = await makeApp();
  const functionsDir = path.join(root, 'packages', 'functions');
  await mkdir(path.join(functionsDir, 'src', 'fixtures'), { recursive: true });
  await Promise.all([
    writeFile(
      path.join(functionsDir, 'src', 'fixtures', 'ignored.ts'),
      "udf.func('ignoredFixture', (): string => 'ignored', []);\n"
    ),
    writeFile(
      path.join(functionsDir, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            module: 'ESNext',
            moduleResolution: 'Bundler',
            skipLibCheck: true,
            strict: true,
            target: 'ES2022',
          },
          include: ['src/function_app.ts', 'src/types.ts'],
          exclude: ['src/fixtures/**/*'],
        },
        null,
        2
      ) + '\n'
    ),
  ]);

  const result = await validate(root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('passes when authored input and output signatures match AppFunctionsSchema', async () => {
  const result = await validate(
    await makeApp({
      functionSource: `
udf.func(
  'helloWorld',
  (firstName: string, lastName: string): string => firstName + lastName,
  []
);
`,
      typesSource: `
export type AppFunctionsSchema = {
  helloWorld: {
    input: { firstName: string; lastName: string };
    output: string;
  };
};
`,
    })
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('passes when generated string-enum contracts use literal unions', async () => {
  const result = await validate(
    await makeApp({
      functionSource: `
enum Status {
  Ready = 'ready',
  Blocked = 'blocked',
}
udf.func('status', (status: Status): Status => status, []);
`,
      typesSource: `
export type AppFunctionsSchema = {
  status: {
    input: { status: 'ready' | 'blocked' };
    output: 'ready' | 'blocked';
  };
};
`,
    })
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('fails when an authored input signature differs from AppFunctionsSchema', async () => {
  const result = await validate(
    await makeApp({
      functionSource: `
udf.func(
  'helloWorld',
  (firstName: number, lastName: number): string => String(firstName + lastName),
  []
);
`,
      typesSource: `
export type AppFunctionsSchema = {
  helloWorld: {
    input: { firstName: string; lastName: string };
    output: string;
  };
};
`,
    })
  );
  assert.equal(result.status, 1);
  assert.match(
    JSON.parse(result.stdout).failures.join('\n'),
    /different input or output signature/u
  );
});

test('fails when an authored output signature differs from AppFunctionsSchema', async () => {
  const result = await validate(
    await makeApp({
      functionSource: `
udf.func(
  'helloWorld',
  (firstName: string, lastName: string): number => firstName.length + lastName.length,
  []
);
`,
      typesSource: `
export type AppFunctionsSchema = {
  helloWorld: {
    input: { firstName: string; lastName: string };
    output: string;
  };
};
`,
    })
  );
  assert.equal(result.status, 1);
  assert.match(
    JSON.parse(result.stdout).failures.join('\n'),
    /different input or output signature/u
  );
});

test('preserves whitespace inside literal contract values', async () => {
  const result = await validate(
    await makeApp({
      functionSource: `
udf.func(
  'status',
  (status: 'in  progress'): 'in  progress' => status,
  []
);
`,
      typesSource: `
export type AppFunctionsSchema = {
  status: {
    input: { status: 'in progress' };
    output: 'in progress';
  };
};
`,
    })
  );
  assert.equal(result.status, 1);
  assert.match(
    JSON.parse(result.stdout).failures.join('\n'),
    /different input or output signature/u
  );
});

test('rejects a cast directly around client.functions', async () => {
  const result = await validate(
    await makeApp({
      frontend: `
const invoker = getRayfinClientSync().functions as unknown as {
  githubRepositoryMetadata: { invoke(): Promise<string> };
};
void invoker;
`,
    })
  );
  assert.equal(result.status, 1);
  assert.match(
    JSON.parse(result.stdout).failures.join('\n'),
    /type assertion around the Functions client/u
  );
});

test('rejects casting the client before accessing functions', async () => {
  const result = await validate(
    await makeApp({
      frontend: `
const result = (getRayfinClientSync() as any).functions.helloWorld;
void result;
`,
    })
  );
  assert.equal(result.status, 1);
  assert.match(
    JSON.parse(result.stdout).failures.join('\n'),
    /type assertion around the Functions client/u
  );
});

test('rejects casting a local alias of client.functions', async () => {
  const result = await validate(
    await makeApp({
      frontend: `
const functions = getRayfinClientSync().functions;
const invoker = functions as unknown as {
  helloWorld: { invoke(input: { incompatible: number }): Promise<number> };
};
void invoker;
`,
    })
  );
  assert.equal(result.status, 1);
  assert.match(
    JSON.parse(result.stdout).failures.join('\n'),
    /type assertion around the Functions client/u
  );
});

test('rejects casting a destructured alias of client.functions', async () => {
  const result = await validate(
    await makeApp({
      frontend: `
const { functions } = getRayfinClientSync();
const invoker = functions as unknown as {
  helloWorld: { invoke(input: { incompatible: number }): Promise<number> };
};
void invoker;
`,
    })
  );
  assert.equal(result.status, 1);
  assert.match(
    JSON.parse(result.stdout).failures.join('\n'),
    /type assertion around the Functions client/u
  );
});

test('rejects casting a client alias to a named Functions-bearing type', async () => {
  const result = await validate(
    await makeApp({
      frontend: `
type CustomClient = {
  functions: {
    helloWorld: { invoke(input: { incompatible: number }): Promise<number> };
  };
};
const client = getRayfinClientSync() as unknown as CustomClient;
void client.functions.helloWorld;
`,
    })
  );
  assert.equal(result.status, 1);
  assert.match(
    JSON.parse(result.stdout).failures.join('\n'),
    /type assertion around the Functions client/u
  );
});

test('rejects erasing a client alias to any before Functions access', async () => {
  const result = await validate(
    await makeApp({
      frontend: `
const client = getRayfinClientSync() as any;
void client.functions.helloWorld;
`,
    })
  );
  assert.equal(result.status, 1);
  assert.match(
    JSON.parse(result.stdout).failures.join('\n'),
    /type assertion around the Functions client/u
  );
});

test('rejects erasing a client alias to a generic record', async () => {
  const result = await validate(
    await makeApp({
      frontend: `
const client = getRayfinClientSync() as unknown as Record<string, unknown>;
void client.functions;
`,
    })
  );
  assert.equal(result.status, 1);
  assert.match(
    JSON.parse(result.stdout).failures.join('\n'),
    /type assertion around the Functions client/u
  );
});

test('allows as const around a container that invokes a typed function', async () => {
  const result = await validate(
    await makeApp({
      frontend: `
const actions = [
  {
    run: () => getRayfinClientSync().functions.helloWorld.invoke({}),
  },
] as const;
void actions;
`,
    })
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('allows unrelated application casts', async () => {
  const result = await validate(
    await makeApp({
      frontend: `
const payload = JSON.parse('{"ok":true}') as { ok: boolean };
void payload;
void getRayfinClientSync().functions.helloWorld;
`,
    })
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

// Mirrors the analytics pack's use-semantic-model-query hook.
test('allows casting the client to reach a non-Functions member', async () => {
  const result = await validate(
    await makeApp({
      frontend: `
const client = getRayfinClientSync();
const connectors = (client as { connectors?: unknown }).connectors;
void connectors;
void getRayfinClientSync().functions.helloWorld;
`,
    })
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
