// @cpt-dod:cpt-frontx-dod-composed-provenance-provenance-at-scaffold:p1
import { describe, expect, it } from 'vitest';
import { formatOccupiedBoundary } from '../provenance/boundary';

describe('formatOccupiedBoundary', () => {
  it('serializes non-empty ownership boundaries as deterministic lossless JSON', () => {
    const formatted = formatOccupiedBoundary({
      exclusiveSubtrees: ['zeta/', 'alpha/', 'zeta/'],
      sharedFiles: [
        {
          path: 'package.json',
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
          { path: 'package.json', mergeStrategy: 'region-union', ownedRegions: ['scripts.build', 'scripts.test'] },
          { path: 'tsconfig.json', mergeStrategy: 'exclusive', ownedRegions: [] },
        ],
      }),
    );
  });

  it('serializes an empty ownership boundary as the lossless owns-nothing boundary', () => {
    expect(formatOccupiedBoundary({ exclusiveSubtrees: [], sharedFiles: [] })).toBe(
      '{"exclusiveSubtrees":[],"sharedFiles":[]}',
    );
  });
});
