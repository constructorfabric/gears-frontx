import { describe, expect, it } from 'vitest';
import { formatOccupiedBoundary } from '../provenance/boundary';

describe('formatOccupiedBoundary', () => {
  it('serializes non-empty ownership boundaries as deterministic lossless JSON', () => {
    const formatted = formatOccupiedBoundary({
      exclusiveSubtrees: ['zeta/', 'alpha/'],
      sharedFiles: [
        { path: 'package.json', mergeStrategy: 'region-union', ownedRegions: ['scripts.test', 'scripts.build'] },
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

  it('keeps the existing empty-boundary sentinel', () => {
    expect(formatOccupiedBoundary({ exclusiveSubtrees: [], sharedFiles: [] })).toBe('.');
  });
});
