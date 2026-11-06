/**
 * OP-013 — the ESM barrel `dist/index.js` must be listed in
 * `sideEffects`: a side-effect import `import '@gears-frontx/gts-plugin'`
 * must not be dropped by bundlers, or the realm store / schema
 * registration the import relies on never runs.
 */
import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';

describe('OP-013 sideEffects covers the ESM barrel', () => {
  it('OP-013: package.json sideEffects includes ./dist/index.js', () => {
    expect(pkg.sideEffects).toEqual(
      expect.arrayContaining([
        './dist/index.js',
        './dist/plugin.js',
        './dist/index.cjs',
      ]),
    );
  });
});
