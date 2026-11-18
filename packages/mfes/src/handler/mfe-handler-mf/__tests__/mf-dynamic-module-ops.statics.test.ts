/**
 * Behaviour of the dynamic-module operations statics (`sourceImports`,
 * `rewriteBareSpecifier`, `importBlobModule`) held by the trust kernel's
 * `DynamicModuleOps`. They are package-internal: the root barrel does not
 * export them.
 */
import { describe, expect, it } from 'vitest';
import { DynamicModuleOps } from '../mf-dynamic-module-ops';

const sourceImports = (source: string, name: string) => DynamicModuleOps.sourceImports(source, name);
const rewriteBareSpecifier = (source: string, name: string, replacement: string) =>
  DynamicModuleOps.rewriteBareSpecifier(source, name, replacement);
const importBlobModule = (url: string) => DynamicModuleOps.importBlobModule(url);

describe('dynamic-module ops — statics', () => {
  describe('sourceImports', () => {
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

  describe('rewriteBareSpecifier', () => {
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

    it('leaves the dynamic import("x") form untouched', () => {
      const src = `const m = import("react");`;
      expect(rewriteBareSpecifier(src, 'react', 'blob:abc')).toBe(src);
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
