/**
 * Behaviour of the dynamic-module operations statics
 * (`findSurvivingDeclaredSharedDepSpecifier`, `specifierEdits`,
 * `importBlobModule`) held by the trust kernel's
 * `DynamicModuleOps`. They are package-internal: the root barrel does not
 * export them.
 */
import { describe, expect, it } from 'vitest';
import { DynamicModuleOps } from '../mf-dynamic-module-ops';
import { SharedDepSpecifierScan } from '../mf-shared-dep-specifier-scan';
import { SourceSplice } from '../SourceSplice';
import { DynamicImportScan } from '../../../unit-format/dynamic-import-scan';

const imports = (source: string) => DynamicImportScan.scanImports(source);
const bind = (source: string, replacements: ReadonlyMap<string, string>): string =>
  SourceSplice.apply(
    source,
    DynamicModuleOps.specifierEdits(source, imports(source), replacements),
  );

const sourceImports = (source: string, name: string): boolean =>
  DynamicModuleOps.findSurvivingDeclaredSharedDepSpecifier(imports(source), [name]) !== undefined;
const rewriteBareSpecifier = (source: string, name: string, replacement: string): string =>
  bind(source, new Map([[name, replacement]]));
const importBlobModule = (url: string) => DynamicModuleOps.importBlobModule(url);

describe('dynamic-module ops — statics', () => {
  describe('findSurvivingDeclaredSharedDepSpecifier', () => {
    it('matches static imports, re-exports and side-effect imports in either quote style', () => {
      expect(sourceImports(`import React from "react";`, 'react')).toBe(true);
      expect(sourceImports(`export { useState } from 'react';`, 'react')).toBe(true);
      expect(sourceImports(`import "react";`, 'react')).toBe(true);
      expect(sourceImports(`import 'react';`, 'react')).toBe(true);
    });

    it('matches exact package names only', () => {
      expect(sourceImports(`import ReactDOM from "react-dom";`, 'react')).toBe(false);
      expect(sourceImports(`import React from "react";`, 'react-dom')).toBe(false);
    });

    it('does not match the dynamic import("x") form', () => {
      expect(sourceImports(`const m = import("react");`, 'react')).toBe(false);
    });

    it('escapes regex metacharacters in the package name', () => {
      expect(sourceImports(`import x from "lodash.merge";`, 'lodash.merge')).toBe(true);
      expect(sourceImports(`import x from "lodashXmerge";`, 'lodash.merge')).toBe(false);
    });

    it('is stable across repeated calls (no lastIndex leakage)', () => {
      const src = `import React from "react";`;
      expect(sourceImports(src, 'react')).toBe(true);
      expect(sourceImports(src, 'react')).toBe(true);
    });
  });

  describe('specifierEdits', () => {
    it('rewrites every static and side-effect import of the exact name, preserving quote style', () => {
      const src =
        `import React from "react";\n` +
        `export { useState } from 'react';\n` +
        `import "react";\n` +
        `import ReactDOM from "react-dom";\n`;
      expect(rewriteBareSpecifier(src, 'react', 'blob:abc')).toBe(
        `import React from "blob:abc";\n` +
          `export { useState } from 'blob:abc';\n` +
          `import "blob:abc";\n` +
          `import ReactDOM from "react-dom";\n`,
      );
    });

    it('rewrites several names in one pass', () => {
      const src = 'import a from "a";\nimport b from "b";\nimport c from "c";\n';
      expect(
        bind(
          src,
          new Map([
            ['a', 'blob:A'],
            ['b', 'blob:B'],
          ]),
        ),
      ).toBe('import a from "blob:A";\nimport b from "blob:B";\nimport c from "c";\n');
    });

    it('leaves the dynamic import("x") form untouched', () => {
      const src = `const m = import("react");`;
      expect(rewriteBareSpecifier(src, 'react', 'blob:abc')).toBe(src);
    });
  });

  describe('text that only looks like an import', () => {
    const lookAlikes = [
      'export const NAME="react";',
      'export function f(x){return x==="react"}',
      'export default function(){return"react"}',
      ';import("react")',
      '}import("react")',
      'const s = "from \\"react\\""; // import "react"\n/* export * from "react" */',
    ];

    it.each(lookAlikes)('is not an import, a rewrite site or a survivor: %s', (src) => {
      expect(sourceImports(src, 'react')).toBe(false);
      expect(rewriteBareSpecifier(src, 'react', 'blob:abc')).toBe(src);
      expect(
        DynamicModuleOps.findSurvivingDeclaredSharedDepSpecifier(imports(src), ['react']),
      ).toBeUndefined();
      expect(SharedDepSpecifierScan.findSurvivingDeclared(imports(src), new Set(['react']))).toBeUndefined();
      expect(SharedDepSpecifierScan.findUndeclaredWellFormedSpecifiers(imports(src), new Set())).toEqual([]);
    });

    it('rewrites and reports an import whose specifier follows a newline', () => {
      const src = 'import\n"react";\nimport {a}\nfrom\n"react";\n';
      expect(sourceImports(src, 'react')).toBe(true);
      expect(rewriteBareSpecifier(src, 'react', 'blob:abc')).toBe(
        'import\n"blob:abc";\nimport {a}\nfrom\n"blob:abc";\n',
      );
      expect(DynamicModuleOps.findSurvivingDeclaredSharedDepSpecifier(imports(src), ['react'])).toBe('react');
    });

    it('warns about an undeclared well-formed specifier of a real import only', () => {
      const src = 'import x from "lodash"; import y from "./local.js"; const s = "from \\"vue\\"";';
      expect(SharedDepSpecifierScan.findUndeclaredWellFormedSpecifiers(imports(src), new Set())).toEqual([
        'lodash',
      ]);
    });
  });

  describe('importBlobModule', () => {
    it.each(['https://example.com/evil.js', 'file:///etc/passwd', './relative.js', '/abs.js'])(
      'rejects the non-inline-content URL %s with the scheme-guard TypeError',
      async (url) => {
        const result = importBlobModule(url);
        expect(result).toBeInstanceOf(Promise);
        await expect(result).rejects.toThrow(TypeError);
        await expect(importBlobModule(url)).rejects.toThrow(
          `importBlobModule accepts only blob: or data: URLs, received: ${url}`,
        );
      },
    );

    it('admits blob: and data: URLs past the scheme guard', async () => {
      // Dynamic import() of a blob:/data: URL is unsupported under vitest's
      // jsdom module loader (see MfeHandlerMF.test.ts), so the import itself
      // may reject — but never with the scheme-guard TypeError.
      for (const url of ['blob:http://localhost/x', 'data:text/javascript,export default 1']) {
        const outcome = await importBlobModule(url).then(
          () => undefined,
          (error: unknown) => error,
        );
        const message = outcome instanceof Error ? outcome.message : '';
        expect(message).not.toContain('importBlobModule accepts only');
      }
    });
  });
});
