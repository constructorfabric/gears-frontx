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

/** Each `import` or `export ... from` statement of a module that is not type-only, by specifier. */
function valueImportSpecifiers(code: string): string[] {
  const statement = /\b(import|export)\s+(type\s+)?[^;'"]*?\bfrom\s+['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]/g;
  const specifiers: string[] = [];
  for (const match of code.matchAll(statement)) {
    if (match[2]) continue;
    specifiers.push(match[3] ?? match[4]);
  }
  return specifiers;
}

function importsMessages(file: string): boolean {
  return valueImportSpecifiers(readFileSync(file, 'utf8')).some(
    (specifier) =>
      specifier.startsWith('.') &&
      join(dirname(file), specifier.replace(/\.js$/, '')) === messagesModule,
  );
}

const importers = sourceFiles(gridDir)
  .filter(importsMessages)
  .map((file) => relative(gridDir, file).split('\\').join('/'))
  .sort();

describe('DataGrid messages imports', () => {
  it('finds the allowed importers, so the scan still matches', () => {
    // A floor: the assertion below would pass vacuously if the scan ever stopped matching.
    expect(importers).toEqual(expect.arrayContaining(ALLOWED));
  });

  it('imports the messages defaults only in the messages context and the order labels', () => {
    expect(importers).toEqual([...ALLOWED].sort());
  });
});
