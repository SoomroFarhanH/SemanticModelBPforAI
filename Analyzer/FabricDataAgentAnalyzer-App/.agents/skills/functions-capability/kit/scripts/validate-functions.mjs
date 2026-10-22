//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

/**
 * validate:functions — prove the authored UDF registrations, generated
 * AppFunctionsSchema, and frontend function access still agree.
 *
 * A normal TypeScript build cannot catch a stale generated contract when app
 * code casts around `client.functions`. This validator fails that false-green
 * state before build, typecheck, or deployment can report success.
 *
 * Emits {"ok":false} and exits nonzero on failure.
 */

import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootFlag = process.argv.indexOf('--root');
const root =
  rootFlag !== -1 && process.argv[rootFlag + 1] !== undefined
    ? path.resolve(process.argv[rootFlag + 1])
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const notes = [];

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    failures.push(
      `${path.relative(root, file)} could not be read as JSON: ${error.message}`
    );
    return undefined;
  }
}

async function walk(directory) {
  const found = [];
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (error) => {
      if (error.code !== 'ENOENT') {
        failures.push(
          `${path.relative(root, directory)} could not be listed (${error.code ?? 'unknown error'}).`
        );
      }
      return [];
    }
  );
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(target)));
    else if (entry.isFile()) found.push(target);
  }
  return found;
}

async function workspacePackages() {
  const manifest = await readJson(path.join(root, 'package.json'));
  if (manifest === undefined) return [];
  const patterns = Array.isArray(manifest.workspaces)
    ? manifest.workspaces
    : (manifest.workspaces?.packages ?? []);
  const packages = [];
  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || !pattern.endsWith('/*')) continue;
    const container = path.resolve(root, pattern.slice(0, -2));
    const relative = path.relative(root, container);
    if (relative.startsWith('..') || !relative) continue;
    const entries = await readdir(container, { withFileTypes: true }).catch(
      () => []
    );
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(container, entry.name);
      const packageManifest = await readJson(
        path.join(directory, 'package.json')
      );
      if (packageManifest !== undefined) {
        packages.push({ directory, manifest: packageManifest });
      }
    }
  }
  return packages;
}

function propertyName(ts, name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  if (ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function lineLabel(sourceFile, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  return `${path.relative(root, sourceFile.fileName)}:${position.line + 1}`;
}

const RUNTIME_INJECTED_PARAM_TYPES = new Set([
  'RayfinContext',
  'FabricItem',
  'DataConnection',
  'Connection',
  'FabricContext',
  'FabricSqlConnection',
  'FabricConnection',
  'FabricUdf',
  'FabricLogger',
]);

function createTypeScriptProgram(ts, directory, files) {
  const tsconfigPath = path.join(directory, 'tsconfig.json');
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error === undefined) {
    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      directory
    );
    if (parsed.errors.length === 0 && parsed.fileNames.length > 0) {
      return ts.createProgram(parsed.fileNames, parsed.options);
    }
  }
  return ts.createProgram(files, {
    allowJs: false,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ESNext,
  });
}

function unwrapPromiseType(type) {
  if (type.getSymbol()?.name !== 'Promise') return type;
  return type.typeArguments?.length === 1 ? type.typeArguments[0] : type;
}

// Keep this serialization aligned with the CLI Functions type generator.
function serializeType(ts, type, checker, depth = 0) {
  if (depth > 8) return checker.typeToString(type);

  const flags = type.getFlags();
  if (flags & ts.TypeFlags.String) return 'string';
  if (flags & ts.TypeFlags.Number) return 'number';
  if (flags & ts.TypeFlags.Boolean) return 'boolean';
  if (flags & ts.TypeFlags.Void) return 'void';
  if (flags & ts.TypeFlags.Null) return 'null';
  if (flags & ts.TypeFlags.Undefined) return 'undefined';
  if (flags & ts.TypeFlags.Any) return 'any';
  if (flags & ts.TypeFlags.Unknown) return 'unknown';
  if (flags & ts.TypeFlags.Never) return 'never';

  if (flags & ts.TypeFlags.StringLiteral) return `'${type.value}'`;
  if (flags & ts.TypeFlags.NumberLiteral) return `${type.value}`;

  if (type.isUnion()) {
    const allBoolean =
      type.types.length === 2 &&
      type.types.every(
        (member) => !!(member.getFlags() & ts.TypeFlags.BooleanLiteral)
      );
    if (allBoolean) return 'boolean';
    return type.types
      .map((member) => serializeType(ts, member, checker, depth + 1))
      .join(' | ');
  }

  if (type.isIntersection()) {
    return type.types
      .map((member) => serializeType(ts, member, checker, depth + 1))
      .join(' & ');
  }

  if (flags & ts.TypeFlags.Object) {
    const objectFlags = type.objectFlags;
    const symbol = type.getSymbol();

    if (objectFlags & ts.ObjectFlags.Tuple) {
      const elements =
        type.typeArguments?.map((member) =>
          serializeType(ts, member, checker, depth + 1)
        ) ?? [];
      return `[${elements.join(', ')}]`;
    }

    if (objectFlags & ts.ObjectFlags.Reference) {
      const targetName = type.target?.getSymbol()?.name;
      if (targetName === 'Array' || targetName === 'ReadonlyArray') {
        const elementType = type.typeArguments?.[0];
        if (elementType !== undefined) {
          const inner = serializeType(ts, elementType, checker, depth + 1);
          return elementType.isUnion() || elementType.isIntersection()
            ? `(${inner})[]`
            : `${inner}[]`;
        }
        return 'any[]';
      }
    }

    if (symbol?.name === 'Promise') {
      const inner = type.typeArguments?.[0];
      if (inner !== undefined) {
        return serializeType(ts, inner, checker, depth + 1);
      }
    }

    const isAnonymous = !!(objectFlags & ts.ObjectFlags.Anonymous);
    if (
      !isAnonymous &&
      symbol !== undefined &&
      !symbol.name.startsWith('__') &&
      symbol.declarations?.length > 0 &&
      symbol.declarations.every(
        (declaration) => declaration.getSourceFile().isDeclarationFile
      )
    ) {
      const typeArguments = type.typeArguments;
      if (typeArguments?.length > 0) {
        const argumentsText = typeArguments.map((member) =>
          serializeType(ts, member, checker, depth + 1)
        );
        return `${symbol.name}<${argumentsText.join(', ')}>`;
      }
      return symbol.name;
    }

    const properties = type.getProperties();
    const indexInfos = checker.getIndexInfosOfType(type);
    if (properties.length > 0 || indexInfos.length > 0) {
      const members = [];
      for (const info of indexInfos) {
        const keyType = serializeType(ts, info.keyType, checker, depth + 1);
        const valueType = serializeType(ts, info.type, checker, depth + 1);
        members.push(
          `${info.isReadonly ? 'readonly ' : ''}[k: ${keyType}]: ${valueType}`
        );
      }
      for (const property of properties) {
        const propertyType = checker.getTypeOfSymbol(property);
        const optional = property.flags & ts.SymbolFlags.Optional ? '?' : '';
        const propertyName = /^[$A-Z_a-z][$\w]*$/.test(property.name)
          ? property.name
          : JSON.stringify(property.name);
        members.push(
          `${propertyName}${optional}: ${serializeType(ts, propertyType, checker, depth + 1)}`
        );
      }
      return `{ ${members.join('; ')} }`;
    }

    if (type.getCallSignatures().length > 0) {
      return checker.typeToString(type);
    }
    return '{}';
  }

  return checker.typeToString(type);
}

function canonicalTypeText(ts, text) {
  const sourceFile = ts.createSourceFile(
    '__functions_contract_type.ts',
    `type Contract = ${text};`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const declaration = sourceFile.statements[0];
  if (!ts.isTypeAliasDeclaration(declaration)) return text.trim();
  return ts
    .createPrinter({ removeComments: true })
    .printNode(ts.EmitHint.Unspecified, declaration.type, sourceFile)
    .trim();
}

function resolveHandlerContract(ts, checker, handler) {
  if (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler)) {
    return undefined;
  }

  const input = new Map();
  let positionalIndex = 0;
  for (const parameter of handler.parameters) {
    const type = checker.getTypeAtLocation(parameter);
    if (RUNTIME_INJECTED_PARAM_TYPES.has(type.getSymbol()?.name ?? '')) {
      continue;
    }
    const name = ts.isIdentifier(parameter.name)
      ? parameter.name.text
      : `arg${positionalIndex}`;
    positionalIndex++;
    input.set(name, type);
  }

  const signature = checker.getSignatureFromDeclaration(handler);
  return {
    input,
    output:
      signature === undefined
        ? undefined
        : unwrapPromiseType(checker.getReturnTypeOfSignature(signature)),
  };
}

function resolveGeneratedContract(ts, member) {
  if (
    !ts.isPropertySignature(member) ||
    member.name === undefined ||
    member.type === undefined ||
    !ts.isTypeLiteralNode(member.type)
  ) {
    return undefined;
  }
  const input = member.type.members.find(
    (entry) =>
      ts.isPropertySignature(entry) &&
      entry.name !== undefined &&
      propertyName(ts, entry.name) === 'input'
  );
  const output = member.type.members.find(
    (entry) =>
      ts.isPropertySignature(entry) &&
      entry.name !== undefined &&
      propertyName(ts, entry.name) === 'output'
  );
  if (
    input === undefined ||
    output === undefined ||
    !ts.isPropertySignature(input) ||
    !ts.isPropertySignature(output) ||
    input.type === undefined ||
    output.type === undefined
  ) {
    return undefined;
  }
  return {
    input: canonicalTypeText(ts, input.type.getText()),
    output: canonicalTypeText(ts, output.type.getText()),
  };
}

function serializedHandlerContract(ts, checker, contract) {
  const inputFields = [...contract.input].map(
    ([name, type]) => `${name}: ${serializeType(ts, type, checker)}`
  );
  return {
    input: canonicalTypeText(
      ts,
      inputFields.length > 0
        ? `{ ${inputFields.join('; ')} }`
        : 'Record<string, never>'
    ),
    output: canonicalTypeText(ts, serializeType(ts, contract.output, checker)),
  };
}

function isFunctionsProperty(ts, node) {
  return (
    (ts.isPropertyAccessExpression(node) && node.name.text === 'functions') ||
    (ts.isElementAccessExpression(node) &&
      node.argumentExpression !== undefined &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === 'functions')
  );
}

function symbolForIdentifier(ts, checker, node) {
  if (!ts.isIdentifier(node)) return undefined;
  const symbol = checker.getSymbolAtLocation(node);
  return symbol !== undefined && !!(symbol.flags & ts.SymbolFlags.Alias)
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

function expressionIsFunctionsChain(ts, checker, node, aliases) {
  if (isFunctionsProperty(ts, node)) return true;
  if (ts.isIdentifier(node)) {
    const symbol = symbolForIdentifier(ts, checker, node);
    return symbol !== undefined && aliases.has(symbol);
  }
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node)
  ) {
    return expressionIsFunctionsChain(ts, checker, node.expression, aliases);
  }
  if (
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node) ||
    ts.isCallExpression(node)
  ) {
    return expressionIsFunctionsChain(ts, checker, node.expression, aliases);
  }
  return false;
}

const CLIENT_GETTERS = new Set(['getRayfinClient', 'getRayfinClientSync']);

function expressionIsClientChain(ts, checker, node, aliases) {
  if (ts.isIdentifier(node)) {
    const symbol = symbolForIdentifier(ts, checker, node);
    return symbol !== undefined && aliases.has(symbol);
  }
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isAwaitExpression(node)
  ) {
    return expressionIsClientChain(ts, checker, node.expression, aliases);
  }
  if (ts.isCallExpression(node)) {
    const called = node.expression;
    if (
      (ts.isIdentifier(called) && CLIENT_GETTERS.has(called.text)) ||
      (ts.isPropertyAccessExpression(called) &&
        CLIENT_GETTERS.has(called.name.text))
    ) {
      return true;
    }
  }
  return checker.getTypeAtLocation(node).getProperty('functions') !== undefined;
}

function castTouchesFunctions(
  ts,
  checker,
  node,
  sourceFile,
  functionAliases,
  clientAliases
) {
  const typeText = node.type.getText(sourceFile);
  if (
    expressionIsFunctionsChain(ts, checker, node.expression, functionAliases) ||
    /\bfunctions\s*[?:]/iu.test(typeText)
  ) {
    return true;
  }

  const castsTheClient = expressionIsClientChain(
    ts,
    checker,
    node.expression,
    clientAliases
  );

  let current = node;
  while (current.parent !== undefined) {
    const parent = current.parent;
    if (ts.isParenthesizedExpression(parent) && parent.expression === current) {
      current = parent;
      continue;
    }
    if (
      (ts.isPropertyAccessExpression(parent) ||
        ts.isElementAccessExpression(parent)) &&
      parent.expression === current
    ) {
      if (isFunctionsProperty(ts, parent)) return true;
      // A client cast read straight into some other member never reaches
      // Functions, so it is not the stale-schema bypass this rule guards.
      if (castsTheClient) return false;
      current = parent;
      continue;
    }
    if (
      (ts.isCallExpression(parent) || ts.isNonNullExpression(parent)) &&
      parent.expression === current
    ) {
      current = parent;
      continue;
    }
    break;
  }
  return castsTheClient;
}

const packages = await workspacePackages();
const functionsPackage = packages.find(
  ({ manifest }) => manifest.name === '@rayfin-app/functions'
);
const frontendPackage = packages.find(
  ({ manifest }) => manifest.name === '@rayfin-app/frontend'
);

if (functionsPackage === undefined) {
  failures.push(
    'The functions capability is enabled, but workspace package `@rayfin-app/functions` was not found.'
  );
}
if (frontendPackage === undefined) {
  failures.push('Workspace package `@rayfin-app/frontend` was not found.');
}

async function loadTypeScript() {
  const anchors = [
    frontendPackage?.directory,
    functionsPackage?.directory,
    root,
  ].filter(Boolean);
  for (const anchor of anchors) {
    const require = createRequire(path.join(anchor, 'package.json'));
    for (const candidate of ['typescript', 'typescript-compiler']) {
      try {
        const resolved = require.resolve(candidate);
        const loaded = await import(pathToFileURL(resolved).href);
        const ts = loaded.default ?? loaded;
        if (typeof ts.createSourceFile === 'function') return ts;
      } catch {
        // Try the next package or workspace anchor.
      }
    }
  }
  return undefined;
}

const ts = await loadTypeScript();
if (ts === undefined) {
  failures.push(
    'The TypeScript compiler could not be loaded, so the generated Functions contract was not validated. Run `npm install` and retry.'
  );
}

const authored = new Map();
const generated = new Map();
const unsafeCastLocations = new Set();

if (ts !== undefined && functionsPackage !== undefined) {
  const functionsSourceRoot = path.join(functionsPackage.directory, 'src');
  const discoveredSourceFiles = (await walk(functionsSourceRoot)).filter(
    (file) =>
      /\.[cm]?tsx?$/u.test(file) &&
      !/types\.ts$/u.test(file) &&
      !/\.(?:spec|test)\.[cm]?tsx?$/u.test(file)
  );
  const typesPath = path.join(functionsSourceRoot, 'types.ts');
  const functionsProgram = createTypeScriptProgram(
    ts,
    functionsPackage.directory,
    [...discoveredSourceFiles, typesPath]
  );
  const checker = functionsProgram.getTypeChecker();
  const functionsSourcePrefix = `${functionsSourceRoot.replace(/\\/gu, '/')}/`;
  const sourceFiles = functionsProgram.getSourceFiles().filter((sourceFile) => {
    if (sourceFile.isDeclarationFile) return false;
    const normalized = sourceFile.fileName.replace(/\\/gu, '/');
    const basename = path.basename(normalized);
    return (
      normalized.startsWith(functionsSourcePrefix) &&
      basename !== 'types.ts' &&
      !/\.(?:spec|test)\.[cm]?tsx?$/u.test(basename)
    );
  });

  for (const sourceFile of sourceFiles) {
    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'func'
      ) {
        const name = node.arguments[0];
        if (
          name !== undefined &&
          (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name))
        ) {
          const existing = authored.get(name.text);
          if (existing !== undefined) {
            failures.push(
              `Function "${name.text}" is registered more than once (${existing.location} and ${lineLabel(sourceFile, name)}).`
            );
          } else {
            const contract = resolveHandlerContract(
              ts,
              checker,
              node.arguments[1]
            );
            if (contract === undefined || contract.output === undefined) {
              failures.push(
                `${lineLabel(sourceFile, node)} uses a function handler whose public signature could not be resolved. Use an inline typed function so AppFunctionsSchema can be validated.`
              );
            } else {
              authored.set(name.text, {
                ...contract,
                location: lineLabel(sourceFile, name),
              });
            }
          }
        } else {
          failures.push(
            `${lineLabel(sourceFile, node)} registers a function with a non-literal name, so AppFunctionsSchema cannot prove the contract.`
          );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  const typesSource = functionsProgram.getSourceFile(typesPath);
  if (typesSource === undefined) {
    failures.push(
      `${path.relative(root, typesPath)} is missing. Run the supported Functions type-generation flow.`
    );
  } else {
    const schema = typesSource.statements.find(
      (statement) =>
        ts.isTypeAliasDeclaration(statement) &&
        statement.name.text === 'AppFunctionsSchema'
    );
    if (
      schema === undefined ||
      !ts.isTypeAliasDeclaration(schema) ||
      !ts.isTypeLiteralNode(schema.type)
    ) {
      failures.push(
        `${path.relative(root, typesPath)} must export AppFunctionsSchema as a generated object type.`
      );
    } else {
      for (const member of schema.type.members) {
        if (!ts.isPropertySignature(member) || member.name === undefined)
          continue;
        const name = propertyName(ts, member.name);
        if (name === undefined) continue;
        const contract = resolveGeneratedContract(ts, member);
        if (contract === undefined) {
          failures.push(
            `${lineLabel(typesSource, member)} defines "${name}" without generated input and output contract types.`
          );
          continue;
        }
        generated.set(name, contract);
      }
    }
  }

  for (const [name, authoredContract] of authored) {
    const generatedContract = generated.get(name);
    if (generatedContract === undefined) {
      failures.push(
        `Generated AppFunctionsSchema is stale: authored function "${name}" at ${authoredContract.location} is missing from packages/functions/src/types.ts. ` +
          'Run the supported Functions type-generation flow and remove any frontend cast used to bypass the missing member.'
      );
      continue;
    }
    const serialized = serializedHandlerContract(ts, checker, authoredContract);
    if (
      serialized.input !== generatedContract.input ||
      serialized.output !== generatedContract.output
    ) {
      failures.push(
        `Generated AppFunctionsSchema is stale: authored function "${name}" at ${authoredContract.location} has a different input or output signature than packages/functions/src/types.ts. ` +
          'Run the supported Functions type-generation flow.'
      );
    }
  }
  for (const name of generated.keys()) {
    if (!authored.has(name)) {
      failures.push(
        `Generated AppFunctionsSchema is stale: "${name}" remains in packages/functions/src/types.ts but no authored udf.func() registration exists. ` +
          'Run the supported Functions type-generation flow.'
      );
    }
  }
}

if (ts !== undefined && frontendPackage !== undefined) {
  const frontendSourceRoot = path.join(frontendPackage.directory, 'src');
  const frontendFiles = (await walk(frontendSourceRoot)).filter(
    (file) =>
      /\.[cm]?tsx?$/u.test(file) &&
      !/\.d\.ts$/u.test(file) &&
      !/\.(?:spec|test)\.[cm]?tsx?$/u.test(file) &&
      !/[\\/]test[\\/]/u.test(file)
  );
  const frontendProgram = createTypeScriptProgram(
    ts,
    frontendPackage.directory,
    frontendFiles
  );
  const checker = frontendProgram.getTypeChecker();
  const sourceFiles = frontendFiles
    .map((file) => frontendProgram.getSourceFile(file))
    .filter(Boolean);
  const functionAliases = new Set();
  const clientAliases = new Set();
  let aliasesChanged = true;
  while (aliasesChanged) {
    aliasesChanged = false;
    for (const sourceFile of sourceFiles) {
      const collectAliases = (node) => {
        if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
          if (ts.isIdentifier(node.name)) {
            const symbol = symbolForIdentifier(ts, checker, node.name);
            if (
              symbol !== undefined &&
              expressionIsFunctionsChain(
                ts,
                checker,
                node.initializer,
                functionAliases
              ) &&
              !functionAliases.has(symbol)
            ) {
              functionAliases.add(symbol);
              aliasesChanged = true;
            } else if (
              symbol !== undefined &&
              expressionIsClientChain(
                ts,
                checker,
                node.initializer,
                clientAliases
              ) &&
              !clientAliases.has(symbol)
            ) {
              clientAliases.add(symbol);
              aliasesChanged = true;
            }
          } else if (
            ts.isObjectBindingPattern(node.name) &&
            expressionIsClientChain(
              ts,
              checker,
              node.initializer,
              clientAliases
            )
          ) {
            for (const element of node.name.elements) {
              const boundProperty = element.propertyName ?? element.name;
              if (
                !ts.isIdentifier(element.name) ||
                propertyName(ts, boundProperty) !== 'functions'
              ) {
                continue;
              }
              const symbol = symbolForIdentifier(ts, checker, element.name);
              if (symbol !== undefined && !functionAliases.has(symbol)) {
                functionAliases.add(symbol);
                aliasesChanged = true;
              }
            }
          }
        }
        ts.forEachChild(node, collectAliases);
      };
      collectAliases(sourceFile);
    }
  }
  for (const sourceFile of sourceFiles) {
    const visit = (node) => {
      if (
        (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
        castTouchesFunctions(
          ts,
          checker,
          node,
          sourceFile,
          functionAliases,
          clientAliases
        )
      ) {
        unsafeCastLocations.add(lineLabel(sourceFile, node));
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
}

for (const location of unsafeCastLocations) {
  failures.push(
    `${location} uses a type assertion around the Functions client. Do not cast around a stale AppFunctionsSchema; regenerate packages/functions/src/types.ts and invoke the generated member directly.`
  );
}

const ok = failures.length === 0;
console.log(
  JSON.stringify(
    {
      ok,
      checked: {
        authoredFunctions: authored.size,
        generatedFunctions: generated.size,
        unsafeFunctionCasts: unsafeCastLocations.size,
      },
      failures,
      notes,
    },
    null,
    2
  )
);
if (!ok) process.exitCode = 1;
