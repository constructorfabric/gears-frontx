import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/*
 * The grid's `messages` prop reaches a string only when the component reads it through the
 * messages context. A component that imports the `messages` defaults directly passes every test
 * and stays in the default language for a consumer who translated the rest. So the value import
 * of the `messages` module is allowed in two places only: the context, which merges the prop over
 * the defaults, and the order labels, whose defaults are the fallback of a parameter. A type
 * import (`import type`) carries no strings and is allowed anywhere.
 */

const gridDir = dirname(fileURLToPath(import.meta.url));
const messagesModule = join(gridDir, 'messages');

const ALLOWED = [
  'services/core/data-grid-messages-context.ts',
  'plugins/order/services/order-labels.ts',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) return [];
    return [path];
  });
}

/**
 * Each `import` or `export ... from` statement and each dynamic `import()` that is not type-only,
 * by specifier. Comments are stripped first, so a commented-out import is not one. Quoted strings
 * are matched in the same pass and kept, so a `/*` or `//` inside a string (a glob, a URL) does not
 * open a comment that would hide a real import. Regex literals are not matched, so one holding `//`
 * or `/*` reads as a comment and could hide an import later on its line.
 */
function valueImportSpecifiers(code: string): string[] {
  const uncommented = code.replace(
    /'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (token) => (token.startsWith('/') ? '' : token),
  );
  const statement =
    /\b(import|export)\s+(type\s+)?[^;'"]*?\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(?\s*['"]([^'"]+)['"]/g;
  const specifiers: string[] = [];
  for (const match of uncommented.matchAll(statement)) {
    if (match[2]) continue;
    specifiers.push(match[3] ?? match[4]);
  }
  return specifiers;
}

/** A relative specifier as a path without its extension or a trailing `/index`. */
function modulePath(file: string, specifier: string): string {
  return join(dirname(file), specifier.replace(/\.[cm]?[jt]sx?$/, '').replace(/\/index$/, ''));
}

/** Whether `code`, the source of `file`, value-imports the `messages` module. */
function importsMessages(code: string, file: string): boolean {
  return valueImportSpecifiers(code).some(
    (specifier) => specifier.startsWith('.') && modulePath(file, specifier) === messagesModule,
  );
}

const importers = sourceFiles(gridDir)
  .filter((file) => importsMessages(readFileSync(file, 'utf8'), file))
  .map((file) => relative(gridDir, file).split('\\').join('/'))
  .sort();

describe('DataGrid messages imports', () => {
  it('imports the messages defaults only in the messages context and the order labels', () => {
    // The exact list is also the floor: a scan that stopped matching would find no importer.
    expect(importers).toEqual([...ALLOWED].sort());
  });

  it('reports every value import of the messages module and no type import or comment', () => {
    const file = join(gridDir, 'some-component.tsx');
    const reported = [
      "import { messages as m } from './messages';",
      "import {\n  messages,\n} from './messages';",
      "export { messages } from './messages.js';",
      "const loaded = await import('./messages.js');",
      "import { messages } from './messages.ts';",
      "import { messages } from './messages/index.js';",
      "const g = '**/*.tsx';\nimport { messages } from './messages';\n/* note */",
      "const u = 'http://x'; import { messages } from './messages';",
    ];
    const ignored = [
      "import type { DataGridMessages } from './messages';",
      "// import { messages } from './messages';",
      "/* import { messages } from './messages'; */",
      "import { other } from './messages-helpers';",
    ];

    expect(reported.filter((code) => !importsMessages(code, file))).toEqual([]);
    expect(ignored.filter((code) => importsMessages(code, file))).toEqual([]);
  });
});
