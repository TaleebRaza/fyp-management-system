import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let typescriptPromise;

async function getTypeScript() {
  if (!typescriptPromise) {
    typescriptPromise = import('typescript').catch((error) => {
      const message = [
        'The TypeScript package is required to run the unit tests.',
        'Run "npm install" (or "npm ci") in the repository, then retry.',
        `Original error: ${error instanceof Error ? error.message : String(error)}`,
      ].join('\n');
      throw new Error(message, { cause: error });
    });
  }

  return typescriptPromise;
}

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE_ROOT = path.join(tmpdir(), `fyp-ts-tests-${process.pid}`);
const compiledFiles = new Map();

function resolveProjectModule(fromFile, specifier) {
  const basePath = path.resolve(path.dirname(fromFile), specifier);
  const candidates = path.extname(basePath)
    ? [basePath]
    : [
        `${basePath}.ts`,
        `${basePath}.tsx`,
        `${basePath}.mts`,
        `${basePath}.js`,
        `${basePath}.mjs`,
        path.join(basePath, 'index.ts'),
        path.join(basePath, 'index.tsx'),
        path.join(basePath, 'index.mts'),
        path.join(basePath, 'index.js'),
        path.join(basePath, 'index.mjs'),
      ];

  const resolved = candidates.find((candidate) => existsSync(candidate));
  if (!resolved) {
    throw new Error(`Unable to resolve test dependency "${specifier}" from ${path.relative(PROJECT_ROOT, fromFile)}.`);
  }

  return resolved;
}

function outputPathFor(sourcePath) {
  const relativePath = path.relative(PROJECT_ROOT, sourcePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Refusing to compile a TypeScript file outside the repository: ${sourcePath}`);
  }

  return path.join(CACHE_ROOT, relativePath.replace(/\.(?:tsx?|mts)$/, '.mjs'));
}

function collectRuntimeImports(ts, sourceText, sourcePath) {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const imports = [];

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (statement.importClause?.isTypeOnly) continue;
      const specifier = statement.moduleSpecifier;
      if (ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) {
        imports.push(specifier.text);
      }
      continue;
    }

    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      const specifier = statement.moduleSpecifier;
      if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) {
        imports.push(specifier.text);
      }
    }
  }

  return [...new Set(imports)];
}

function replaceModuleSpecifier(code, originalSpecifier, replacementSpecifier) {
  const escaped = originalSpecifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`(["'])${escaped}\\1`, 'g');
  return code.replace(expression, (_match, quote) => `${quote}${replacementSpecifier}${quote}`);
}

async function compileTypeScriptModule(sourcePath) {
  const absoluteSourcePath = path.resolve(sourcePath);
  const cached = compiledFiles.get(absoluteSourcePath);
  if (cached) return cached;

  const outputPath = outputPathFor(absoluteSourcePath);
  compiledFiles.set(absoluteSourcePath, outputPath);

  const [ts, sourceText] = await Promise.all([
    getTypeScript(),
    readFile(absoluteSourcePath, 'utf8'),
  ]);
  const runtimeImports = collectRuntimeImports(ts, sourceText, absoluteSourcePath);
  const resolvedImports = [];

  for (const specifier of runtimeImports) {
    const dependencySource = resolveProjectModule(absoluteSourcePath, specifier);
    const dependencyOutput = await compileTypeScriptModule(dependencySource);
    let outputSpecifier = path.relative(path.dirname(outputPath), dependencyOutput).replace(/\\/g, '/');
    if (!outputSpecifier.startsWith('.')) outputSpecifier = `./${outputSpecifier}`;
    resolvedImports.push({ specifier, outputSpecifier });
  }

  const result = ts.transpileModule(sourceText, {
    fileName: absoluteSourcePath,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      isolatedModules: true,
      sourceMap: false,
      inlineSourceMap: false,
    },
  });

  const diagnostics = (result.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  );
  if (diagnostics.length > 0) {
    const formatted = diagnostics
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
      .join('\n');
    throw new Error(`TypeScript transpilation failed for ${path.relative(PROJECT_ROOT, absoluteSourcePath)}:\n${formatted}`);
  }

  let outputText = result.outputText;
  for (const { specifier, outputSpecifier } of resolvedImports) {
    outputText = replaceModuleSpecifier(outputText, specifier, outputSpecifier);
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, outputText, 'utf8');
  return outputPath;
}

export async function importTypeScriptModule(repositoryRelativePath) {
  const sourcePath = path.resolve(PROJECT_ROOT, repositoryRelativePath);
  const outputPath = await compileTypeScriptModule(sourcePath);
  const sourceContent = await readFile(sourcePath);
  const cacheKey = createHash('sha256').update(sourceContent).digest('hex').slice(0, 12);
  return import(`${pathToFileURL(outputPath).href}?source=${cacheKey}`);
}
