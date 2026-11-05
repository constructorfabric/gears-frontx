/**
 * Linkage-first layout of an emitted ESM module, applied to the preserved-module
 * output of the shareable ecosystem packages (`ecosystem_package_build_output`;
 * ADR 0034, Barrels).
 *
 * A consuming or producing build moves a named import off a package's barrel
 * to the module that defines the binding. It does so by reading module
 * linkage — import and export declarations — not by evaluating or fully
 * parsing module bodies. Bundler output does not make that easy: esbuild and
 * Rollup render a pure re-export module as `import { a } from './a.js';`
 * followed by a trailing `export { a };`, and every other module keeps its one
 * `export { … };` clause after the whole body. Two layout rules make the
 * linkage readable at the top of each module:
 *
 *  - **Barrel**: a module made only of imports and one local export clause
 *    whose every name is an imported binding is rewritten into plain
 *    re-exports (`export { a, b as c } from './x.js';`, `export * as ns from`).
 *    An import none of whose bindings is exported stays as `import './x.js';`,
 *    so evaluation order is unchanged.
 *  - **Defining module**: the module's single local export clause moves up to
 *    just after its leading imports (or directive prologue). An export clause
 *    declares bindings and is hoisted by the language, so its position does
 *    not change what the module exports or when anything runs.
 *
 * Both rules keep every mapped line where it is apart from at most one
 * inserted line (a barrel's trailing export clause, after which nothing is
 * mapped, goes with its lines), so a source map stays valid after
 * {@link shiftSourceMap}.
 * Anything outside these shapes (several local export clauses, import
 * attributes) is left as emitted.
 */
import ts from 'typescript';

export interface EsmLinkageEdit {
  /** Start offset (inclusive) of the replaced range in the original code. */
  readonly start: number;
  /** End offset (exclusive) of the replaced range. */
  readonly end: number;
  readonly text: string;
}

export interface EsmLinkagePlan {
  readonly kind: 'barrel' | 'defining';
  readonly edits: readonly EsmLinkageEdit[];
  /** Zero-based generated line inserted by the plan, when one is. */
  readonly insertedLine?: number;
}

interface ImportedBinding {
  readonly declaration: ts.ImportDeclaration;
  /** `default`, `*` (namespace), or the imported name as written. */
  readonly imported: string;
}

export class EsmLinkageLayout {
  /** Plans the layout of `code`, or `undefined` when it is already laid out or out of scope. */
  static plan(code: string): EsmLinkagePlan | undefined {
    const source = ts.createSourceFile('module.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const statements = [...source.statements];
    const localExports = statements.filter(
      (statement): statement is ts.ExportDeclaration =>
        ts.isExportDeclaration(statement) && statement.moduleSpecifier === undefined,
    );
    if (localExports.length !== 1) {
      return undefined;
    }
    const [localExport] = localExports;
    if (localExport.isTypeOnly || localExport.exportClause === undefined || !ts.isNamedExports(localExport.exportClause)) {
      return undefined;
    }
    const imports = statements.filter(ts.isImportDeclaration);
    if (imports.some((declaration) => declaration.attributes !== undefined)) {
      return undefined;
    }
    const isLinkage = (statement: ts.Statement) => ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement);
    if (statements.every(isLinkage)) {
      const barrel = EsmLinkageLayout.planBarrel(source, imports, localExport);
      if (barrel !== undefined) {
        return barrel;
      }
    }
    return EsmLinkageLayout.planDefining(source, statements, localExport);
  }

  /** Applies a plan's edits to the code it was planned for. */
  static apply(code: string, plan: EsmLinkagePlan): string {
    let result = code;
    for (const edit of [...plan.edits].sort((left, right) => right.start - left.start)) {
      result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    }
    return result;
  }

  /**
   * Lays out `code`; `undefined` when nothing changes. `insertedLine` is the
   * generated line to pass to {@link shiftSourceMap}, when one was inserted.
   */
  static layout(code: string): { code: string; insertedLine?: number } | undefined {
    const plan = EsmLinkageLayout.plan(code);
    if (plan === undefined) {
      return undefined;
    }
    return { code: EsmLinkageLayout.apply(code, plan), insertedLine: plan.insertedLine };
  }

  /**
   * A source map (v3 JSON text) for code with one empty generated line
   * inserted at zero-based `line`. Mapping fields other than the generated
   * column are relative across lines, and the generated column resets per
   * line, so an empty line is one more `;` and nothing else.
   */
  static shiftSourceMap(mapText: string, line: number): string {
    const map = JSON.parse(mapText) as { mappings: string };
    const lines = map.mappings.split(';');
    while (lines.length < line) {
      lines.push('');
    }
    lines.splice(line, 0, '');
    return JSON.stringify({ ...map, mappings: lines.join(';') });
  }

  private static planBarrel(
    source: ts.SourceFile,
    imports: ts.ImportDeclaration[],
    localExport: ts.ExportDeclaration,
  ): EsmLinkagePlan | undefined {
    const bindings = new Map<string, ImportedBinding>();
    for (const declaration of imports) {
      const clause = declaration.importClause;
      if (clause === undefined) {
        continue;
      }
      if (clause.isTypeOnly) {
        return undefined;
      }
      if (clause.name !== undefined) {
        bindings.set(clause.name.text, { declaration, imported: 'default' });
      }
      const named = clause.namedBindings;
      if (named !== undefined && ts.isNamespaceImport(named)) {
        bindings.set(named.name.text, { declaration, imported: '*' });
      } else if (named !== undefined) {
        for (const element of named.elements) {
          if (element.isTypeOnly) {
            return undefined;
          }
          bindings.set(element.name.text, {
            declaration,
            imported: (element.propertyName ?? element.name).getText(source),
          });
        }
      }
    }
    const reExported = new Map<ts.ImportDeclaration, { imported: string; exported: string }[]>();
    for (const element of (localExport.exportClause as ts.NamedExports).elements) {
      const local = (element.propertyName ?? element.name).getText(source);
      const binding = bindings.get(local);
      if (binding === undefined || element.isTypeOnly) {
        return undefined;
      }
      const exported = element.name.getText(source);
      reExported.set(binding.declaration, [
        ...(reExported.get(binding.declaration) ?? []),
        { imported: binding.imported, exported },
      ]);
    }
    const edits: EsmLinkageEdit[] = imports.map((declaration) => {
      const specifier = declaration.moduleSpecifier.getText(source);
      const names = reExported.get(declaration) ?? [];
      const statements: string[] = [];
      const named = names.filter((name) => name.imported !== '*');
      if (named.length > 0) {
        const list = named
          .map(({ imported, exported }) => (imported === exported ? exported : `${imported} as ${exported}`))
          .join(', ');
        statements.push(`export { ${list} } from ${specifier};`);
      }
      for (const { exported } of names.filter((name) => name.imported === '*')) {
        statements.push(`export * as ${exported} from ${specifier};`);
      }
      if (statements.length === 0) {
        statements.push(`import ${specifier};`);
      }
      return EsmLinkageLayout.replaceKeepingLines(source, declaration, statements.join(' '));
    });
    // A trailing clause goes with its lines: nothing after it is mapped.
    const isLast = source.statements[source.statements.length - 1] === localExport;
    edits.push(
      isLast
        ? { start: localExport.getStart(source), end: localExport.getEnd(), text: '' }
        : EsmLinkageLayout.replaceKeepingLines(source, localExport, ''),
    );
    return { kind: 'barrel', edits };
  }

  private static planDefining(
    source: ts.SourceFile,
    statements: ts.Statement[],
    localExport: ts.ExportDeclaration,
  ): EsmLinkagePlan | undefined {
    const isPrologue = (statement: ts.Statement) =>
      ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression);
    let leading = 0;
    while (leading < statements.length && isPrologue(statements[leading])) {
      leading += 1;
    }
    while (leading < statements.length && ts.isImportDeclaration(statements[leading])) {
      leading += 1;
    }
    if (statements.indexOf(localExport) <= leading) {
      return undefined;
    }
    // One line, so the layout inserts exactly one generated line.
    const clause = `export { ${(localExport.exportClause as ts.NamedExports).elements
      .map((element) => element.getText(source))
      .join(', ')} };`;
    const removal = EsmLinkageLayout.replaceKeepingLines(source, localExport, '');
    if (leading === 0) {
      return { kind: 'defining', edits: [{ start: 0, end: 0, text: `${clause}\n` }, removal], insertedLine: 0 };
    }
    const anchorEnd = statements[leading - 1].getEnd();
    const anchorLine = source.getLineAndCharacterOfPosition(anchorEnd).line;
    return {
      kind: 'defining',
      edits: [{ start: anchorEnd, end: anchorEnd, text: `\n${clause}` }, removal],
      insertedLine: anchorLine + 1,
    };
  }

  /** Replaces a statement with `text`, padded with the newlines the statement spanned. */
  private static replaceKeepingLines(source: ts.SourceFile, statement: ts.Statement, text: string): EsmLinkageEdit {
    const start = statement.getStart(source);
    const end = statement.getEnd();
    const newlines = source.text.slice(start, end).split('\n').length - 1;
    return { start, end, text: text + '\n'.repeat(newlines) };
  }
}
