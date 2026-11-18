import path from 'node:path';
import ts from 'typescript';

/**
 * Every name (value or type) an entry module exports, read through the
 * TypeScript checker so type-only exports are counted too.
 */
export function exportedNames(entryRelativeToSrc: string): string[] {
  const srcDir = path.resolve(__dirname, '../..');
  const entry = path.join(srcDir, entryRelativeToSrc);
  const program = ts.createProgram([entry], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entry);
  if (!source) throw new Error(`entry not found: ${entry}`);
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) return [];
  return checker
    .getExportsOfModule(moduleSymbol)
    .map((symbol) => symbol.getName())
    .sort();
}

/**
 * Every source file a module reaches through relative imports and
 * re-exports (type-only ones included), as paths relative to `src/`.
 */
export function reachableModules(entryRelativeToSrc: string): string[] {
  const srcDir = path.resolve(__dirname, '../..');
  const entry = path.join(srcDir, entryRelativeToSrc);
  const program = ts.createProgram([entry], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    noEmit: true,
  });
  return program
    .getSourceFiles()
    .map((file) => path.relative(srcDir, file.fileName).split(path.sep).join('/'))
    .filter((relative) => !relative.startsWith('..'))
    .sort();
}
