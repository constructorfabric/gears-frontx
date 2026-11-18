import { expect, expectTypeOf, it } from 'vitest';
import type { ProjectStateDocument as CliState } from '../packages/cli/src/project-state/types';
import type { ProjectStateDocument as KitState } from '../packages/cyber-pilot-kit-frontx/src/project-state';

import { readProjectStateDocument } from '../packages/cyber-pilot-kit-frontx/src/extensions/fs-discovery';

it('the kit can read every CLI project-state version and AI task status', () => {
  expectTypeOf<CliState>().toExtend<KitState>();
  expectTypeOf<CliState['formatVersion']>().toEqualTypeOf<KitState['formatVersion']>();
  type CliTask = NonNullable<CliState['templates'][string]['pendingPostCommit']>;
  type KitTask = NonNullable<KitState['templates'][string]['pendingPostCommit']>;
  expectTypeOf<CliTask['ai']>().toEqualTypeOf<KitTask['ai']>();
});

it.each([1, 2, 3] as const)('reads a CLI formatVersion %i document', formatVersion => {
  const document: CliState = {
    formatVersion,
    templates: {
      app: {
        origin: 'path:vendor/app', version: '2.0.0', targets: ['app'],
        ...(formatVersion >= 2 && { exclusionsBackfilled: true, provenExcludedSubtrees: ['src/'] }),
        ...(formatVersion === 3 && {
          pendingPostCommit: { intentId: '28e6c1e8-b540-492b-b668-8189e15924d1', inventory: 'pending', ai: 'not-required' },
        }),
      },
    },
    projectOwnedRoots: [],
  };
  const reader = { readFile: () => JSON.stringify(document), listDir: () => [] };
  expect(readProjectStateDocument('.', reader)).toEqual(document);
});
