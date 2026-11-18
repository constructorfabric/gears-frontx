/**
 * The realm-shared store adds one option to the provider and nothing else to
 * the public surface: the entry point exports no new value, and the provider
 * gains no method (`cpt-frontx-dod-gts-type-provider-realm-shared-store`).
 */
import { describe, expect, it } from 'vitest';
import * as entry from '../index';
import entrySource from '../index.ts?raw';
import { GtsPlugin } from '../plugin';
describe('public surface', () => {
  it('exports exactly the production surface; the loader stays internal and the options type is not exported', () => {
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

  it('does not export the construction options type (a type export is invisible at runtime, so the entry source text is checked)', () => {
    expect(entrySource).not.toContain('GtsPluginOptions');
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
