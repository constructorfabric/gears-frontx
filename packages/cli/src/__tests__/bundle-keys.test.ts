// @cpt-algo:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1
//
// `findInvalidBundleKey` (`inst-resolve-bundle-keys`) stated directly: which
// key it names and why. The identity fold is pinned both ways — as on a
// case-insensitive volume and as on a case-sensitive one — because the rule
// follows the volume the keys will be written to, and a test that took
// whichever volume it happened to run on would prove nothing on the other.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const volume = vi.hoisted(() => ({ caseInsensitive: true }));
vi.mock('../paths/volume-case', () => ({
  foldForIdentity: (value: string): string => (volume.caseInsensitive ? value.toLowerCase() : value),
}));

import { findInvalidBundleKey } from '../bundle/envelope';

beforeEach(() => {
  volume.caseInsensitive = true;
});

describe('findInvalidBundleKey', () => {
  it('accepts a set of safe, independent keys', () => {
    expect(findInvalidBundleKey(['frontx-template.json', 'src/index.ts', 'src/nested/a.ts', 'srcx.ts', 'src-app/main.ts'])).toBeUndefined();
  });

  it('accepts an empty set, which is not this rule to refuse', () => {
    expect(findInvalidBundleKey([])).toBeUndefined();
  });

  it('names a key that is not a safe path, with the rule that applies', () => {
    expect(findInvalidBundleKey(['src/ok.ts', 'docs/a:b.md'])).toEqual({
      key: 'docs/a:b.md',
      reason: expect.stringContaining('colon'),
    });
    expect(findInvalidBundleKey(['../x'])?.reason).toContain('".."');
    expect(findInvalidBundleKey(['/abs'])?.reason).toContain('absolute');
  });

  it('judges each key on its own before the set, so a key fault is reported ahead of a collision', () => {
    const found = findInvalidBundleKey(['a', 'A', '../x']);

    expect(found?.key).toBe('../x');
  });

  describe('a key that is a directory of another', () => {
    it.each([
      { label: 'the file listed first', keys: ['src', 'src/index.ts'] },
      { label: 'the file listed last', keys: ['src/index.ts', 'src'] },
      { label: 'a deeper directory', keys: ['a/b/c.ts', 'a/b', 'z'] },
      { label: 'a middle directory among others', keys: ['x/y', 'x/y/z/w.ts', 'x/y/z/v.ts'] },
    ])('is refused, naming the file and its child ($label)', ({ keys }) => {
      const found = findInvalidBundleKey(keys);

      expect(found).toBeDefined();
      expect(keys).toContain(found?.key);
      expect(found?.reason).toContain('is also a directory of');
      expect(keys.some((key) => found?.reason.includes(JSON.stringify(key)) && key !== found?.key)).toBe(true);
    });

    it('names the file, not the child, as the offending key', () => {
      expect(findInvalidBundleKey(['src', 'src/index.ts'])).toEqual({
        key: 'src',
        reason: 'is also a directory of "src/index.ts", so both cannot be written',
      });
    });

    it('does not mistake a sibling whose name merely extends the file for a child', () => {
      expect(findInvalidBundleKey(['src', 'srcx/index.ts', 'src.ts', 'src-app/main.ts'])).toBeUndefined();
    });

    it('finds the collision on a case-insensitive volume when only the case differs', () => {
      expect(findInvalidBundleKey(['Src', 'src/index.ts'])?.key).toBe('Src');
    });
  });

  describe('two keys naming one location', () => {
    const precomposed = 'café.ts';
    const decomposed = 'café.ts';

    it('refuses a precomposed and a decomposed spelling, whatever the volume', () => {
      for (const caseInsensitive of [true, false]) {
        volume.caseInsensitive = caseInsensitive;

        const found = findInvalidBundleKey([precomposed, decomposed]);

        expect(found?.key).toBe(decomposed);
        expect(found?.reason).toContain(JSON.stringify(precomposed));
      }
    });

    it('refuses keys differing only in case on a case-insensitive volume, naming the later one and the earlier', () => {
      volume.caseInsensitive = true;

      const found = findInvalidBundleKey(['frontx-template.json', 'FRONTX-TEMPLATE.JSON']);

      expect(found?.key).toBe('FRONTX-TEMPLATE.JSON');
      expect(found?.reason).toContain('"frontx-template.json"');
    });

    it('accepts keys differing only in case on a case-sensitive volume, where they are two files', () => {
      volume.caseInsensitive = false;

      expect(findInvalidBundleKey(['README.md', 'readme.md'])).toBeUndefined();
    });
  });
});
