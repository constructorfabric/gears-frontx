import { describe, expect, it } from 'vitest';
import { formatOccupiedBoundary, parseOccupiedBoundary } from '../provenance/boundary';

describe('formatOccupiedBoundary', () => {
  it('serializes non-empty ownership boundaries as deterministic lossless JSON', () => {
    const formatted = formatOccupiedBoundary({
      exclusiveSubtrees: ['zeta/', 'alpha/', 'zeta/'],
      sharedFiles: [
        {
          path: 'shared.txt',
          mergeStrategy: 'region-union',
          ownedRegions: ['scripts.test', 'scripts.build', 'scripts.test'],
        },
        { path: 'tsconfig.json', mergeStrategy: 'exclusive', ownedRegions: [] },
      ],
    });

    expect(formatted).toBe(
      JSON.stringify({
        exclusiveSubtrees: ['alpha/', 'zeta/'],
        sharedFiles: [
          { path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['scripts.build', 'scripts.test'] },
          { path: 'tsconfig.json', mergeStrategy: 'exclusive', ownedRegions: [] },
        ],
      }),
    );
  });

  it('keeps the existing empty-boundary sentinel', () => {
    expect(formatOccupiedBoundary({ exclusiveSubtrees: [], sharedFiles: [] })).toBe('.');
  });

  it('parses structured occupied boundaries back into shared-file region ownership', () => {
    const boundary = {
      exclusiveSubtrees: ['src/'],
      sharedFiles: [{ path: 'shared.txt', mergeStrategy: 'region-union', ownedRegions: ['a'] }],
    };

    expect(parseOccupiedBoundary(formatOccupiedBoundary(boundary))).toEqual(boundary);
  });

  it('does not infer region ownership from legacy sentinels or path-only strings', () => {
    expect(parseOccupiedBoundary('.')).toBeUndefined();
    expect(parseOccupiedBoundary('shared.txt')).toBeUndefined();
  });
});
