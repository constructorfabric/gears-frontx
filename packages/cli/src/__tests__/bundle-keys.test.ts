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

import { findInvalidBundleKey, encodeBundleValue, decodeBundleValue, isBinaryBundleValue, readBundleFiles } from '../bundle/envelope';

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

describe('BinaryBundleValue encode/decode', () => {
  it('encodeBundleValue produces canonical base64 that decodeBundleValue round-trips', () => {
    const original = Buffer.from('\x00\x01\x02\xFF binary \n\t', 'binary');
    const encoded = encodeBundleValue(original);
    expect(isBinaryBundleValue(encoded)).toBe(true);
    expect(encoded.encoding).toBe('base64');
    const decoded = decodeBundleValue(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.equals(original)).toBe(true);
  });

  it('decodeBundleValue returns null for non-canonical base64 (extra padding, whitespace)', () => {
    // Padding-corrupted base64 is non-canonical
    expect(decodeBundleValue({ encoding: 'base64', data: 'YQ==' })).not.toBeNull(); // canonical 'a'
    expect(decodeBundleValue({ encoding: 'base64', data: 'YQ====' })).toBeNull();   // extra padding
    expect(decodeBundleValue({ encoding: 'base64', data: 'YQ== ' })).toBeNull();    // trailing space
  });

  it('isBinaryBundleValue rejects non-objects and missing fields', () => {
    expect(isBinaryBundleValue('string')).toBe(false);
    expect(isBinaryBundleValue(null)).toBe(false);
    expect(isBinaryBundleValue({ encoding: 'utf-8', data: 'abc' })).toBe(false);
    expect(isBinaryBundleValue({ encoding: 'base64' })).toBe(false);
    expect(isBinaryBundleValue({ encoding: 'base64', data: 123 })).toBe(false);
  });

  // H2a strict form: extra fields are not permitted.
  it('isBinaryBundleValue rejects an object with extra fields beyond encoding+data', () => {
    expect(isBinaryBundleValue({ encoding: 'base64', data: 'YQ==', extra: true })).toBe(false);
    expect(isBinaryBundleValue({ encoding: 'base64', data: 'YQ==', version: 1 })).toBe(false);
  });

  // Valid empty file: data === '' is canonical (Buffer.alloc(0).toString('base64') === '').
  it('decodeBundleValue accepts an empty file (data === empty string)', () => {
    const result = decodeBundleValue({ encoding: 'base64', data: '' });
    expect(result).not.toBeNull();
    expect(result!.length).toBe(0);
  });

  it('UTF-8 text round-trips byte-identically through encode/decode', () => {
    const text = '{"name":"my-template","version":"1.0.0"}';
    const buf = Buffer.from(text, 'utf-8');
    const encoded = encodeBundleValue(buf);
    const decoded = decodeBundleValue(encoded);
    expect(decoded!.toString('utf-8')).toBe(text);
  });
});

describe('readBundleFiles three-state return', () => {
  it('returns undefined when the BUNDLE_MARKER own property is absent', () => {
    expect(readBundleFiles('{"name":"manifest"}')).toBeUndefined();
    expect(readBundleFiles('not json at all')).toBeUndefined();
    expect(readBundleFiles('"a string"')).toBeUndefined();
  });

  it('returns null when BUNDLE_MARKER is present but its value is null', () => {
    expect(readBundleFiles('{"$frontxTemplateFiles":null}')).toBeNull();
  });

  it('returns null when BUNDLE_MARKER is present but its value is an array', () => {
    expect(readBundleFiles('{"$frontxTemplateFiles":[]}')).toBeNull();
    expect(readBundleFiles('{"$frontxTemplateFiles":["a","b"]}')).toBeNull();
  });

  it('returns null when BUNDLE_MARKER is present but its value is a number or string', () => {
    expect(readBundleFiles('{"$frontxTemplateFiles":42}')).toBeNull();
    expect(readBundleFiles('{"$frontxTemplateFiles":"hello"}')).toBeNull();
  });

  it('returns an empty Record when BUNDLE_MARKER is present with an empty object', () => {
    const result = readBundleFiles('{"$frontxTemplateFiles":{}}');
    expect(result).not.toBeNull();
    expect(result).not.toBeUndefined();
    expect(typeof result).toBe('object');
    expect(Object.keys(result!)).toHaveLength(0);
  });

  it('returns the file map when BUNDLE_MARKER is present with a valid object', () => {
    const result = readBundleFiles('{"$frontxTemplateFiles":{"frontx-template.json":"manifest"}}');
    expect(result).not.toBeNull();
    expect(result).not.toBeUndefined();
    expect(result!['frontx-template.json']).toBe('manifest');
  });
});
