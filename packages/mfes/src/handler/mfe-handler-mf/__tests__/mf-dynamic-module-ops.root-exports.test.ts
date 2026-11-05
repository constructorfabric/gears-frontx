/**
 * Root-barrel compatibility of the dynamic-module operations.
 *
 * `sourceImports`, `rewriteBareSpecifier`, and `importBlobModule` are
 * published from the `@gears-frontx/mfes` root as free functions. The trust
 * kernel now holds them as `DynamicModuleOps` statics; this suite pins that
 * the root still exports all three under the same names with the same
 * behaviour, and that the class itself does not cross the barrel.
 */
import { describe, expect, it } from 'vitest';
import * as publicApi from '../../../index';
import {
  importBlobModule,
  rewriteBareSpecifier,
  sourceImports,
} from '../../../index';
import { DynamicModuleOps } from '../mf-dynamic-module-ops';

describe('dynamic-module ops — package root exports', () => {
  it('exports sourceImports, rewriteBareSpecifier and importBlobModule as functions', () => {
    expect(typeof publicApi.sourceImports).toBe('function');
    expect(typeof publicApi.rewriteBareSpecifier).toBe('function');
    expect(typeof publicApi.importBlobModule).toBe('function');
  });

  it('keeps the original arities', () => {
    expect(sourceImports.length).toBe(2);
    expect(rewriteBareSpecifier.length).toBe(3);
    expect(importBlobModule.length).toBe(1);
  });

  it('does not export the DynamicModuleOps class from the root', () => {
    expect(Object.keys(publicApi)).not.toContain('DynamicModuleOps');
  });

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

    it('agrees with DynamicModuleOps.sourceImports', () => {
      const src = `import a from "react";\nimport "@scope/pkg";`;
      for (const name of ['react', '@scope/pkg', 'react-dom']) {
        expect(sourceImports(src, name)).toBe(DynamicModuleOps.sourceImports(src, name));
      }
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

    it('agrees with DynamicModuleOps.rewriteBareSpecifier', () => {
      const src = `import a from "@scope/pkg";\nimport 'lodash.merge';`;
      for (const name of ['@scope/pkg', 'lodash.merge', 'absent']) {
        expect(rewriteBareSpecifier(src, name, 'blob:x')).toBe(
          DynamicModuleOps.rewriteBareSpecifier(src, name, 'blob:x'),
        );
      }
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
