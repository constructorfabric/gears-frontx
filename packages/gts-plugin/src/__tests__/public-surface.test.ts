/**
 * The realm-shared store adds one option to the provider and nothing else to
 * the public surface: the entry point exports no new value, and the provider
 * gains no method (`cpt-frontx-dod-gts-type-provider-realm-shared-store`).
 */
import { describe, expect, it } from 'vitest';
import * as entry from '../index';
import { GtsPlugin } from '../plugin';

describe('public surface', () => {
  it('exports the same values as before; the options type is type-only', () => {
    expect(Object.keys(entry).sort()).toEqual(
      [
        'FRONTX_ACTION_LOAD_EXT',
        'FRONTX_ACTION_MOUNT_EXT',
        'FRONTX_ACTION_UNMOUNT_EXT',
        'GtsPlugin',
        'gtsPlugin',
        'loadLifecycleStages',
        'loadSchemas',
      ].sort()
    );
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
