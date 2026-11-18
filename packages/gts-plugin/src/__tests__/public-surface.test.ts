/**
 * The realm-shared store adds one option to the provider and nothing else to
 * the public surface: the entry point exports no new value, and the provider
 * gains no method (`cpt-frontx-dod-gts-type-provider-realm-shared-store`).
 */
import { describe, expect, it } from 'vitest';
import * as entry from '../index';
import { GtsPlugin } from '../plugin';
// The construction argument's type is internal: the entry point must not export it. A type export
// is invisible at runtime, so type-check:test guards it: the expectation below fails to compile if it appears.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error GtsPluginOptions is not exported from the package entry point
import type { GtsPluginOptions } from '../index';

/** Keeps the guarded import referenced. */
export type OptionsGuard = GtsPluginOptions;

describe('public surface', () => {
  it('exports exactly the production surface; the loader stays internal and the options type is not exported (type-level guard above)', () => {
    expect(Object.keys(entry).sort()).toEqual(
      [
        'FRONTX_ACTION_LOAD_EXT',
        'FRONTX_ACTION_MOUNT_EXT',
        'FRONTX_ACTION_UNMOUNT_EXT',
        'GtsPlugin',
        'gtsPlugin',
        'loadLifecycleStages',
      ].sort()
    );
    expect(Object.keys(entry)).not.toContain('loadSchemas');
  });

  it('keeps the provider to the port methods, with the isolation option as its only addition', () => {
    expect(Object.getOwnPropertyNames(GtsPlugin.prototype).sort()).toEqual(
      [
        'constructor',
        'getSchema',
        'isTypeOf',
        'register',
        'registerSchema',
        'resolveLifecycleStageActivatedId',
        'resolveLifecycleStageDeactivatedId',
        'resolveLifecycleStageDestroyedId',
        'resolveLifecycleStageInitId',
        'resolveLoadExtActionId',
        'resolveMountExtActionId',
        'resolveUnmountExtActionId',
        'validateInstance',
      ].sort()
    );
    expect(GtsPlugin.length).toBe(0);
  });
});
