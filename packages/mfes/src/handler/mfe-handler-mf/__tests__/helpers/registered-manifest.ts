/**
 * Registry-side fixtures for `mfe-handler-mf` test suites.
 *
 * An MFE entry references its manifest by identifier; the runtime reads the
 * registered manifest from the registry's type system. These helpers play the
 * registry: `registerManifest` records a manifest under its id, and
 * `newHandler` builds a handler bound to a type system that answers from
 * those records — the seam `Registry` crosses at registration.
 *
 * The fake plugin answers in a notation that is deliberately NOT GTS.
 */
import { afterEach } from 'vitest';
import { MfeHandlerMF } from '../../MfeHandlerMF';
import type { MfManifest } from '../../../../manifest/mf-manifest';
import type { TypeSystemPlugin } from '../../../../type-substrate';

/** A type system whose schema store is `registered`, keyed by opaque id. */
export function createFakeTypeSystem(
  registered: Map<string, unknown>,
): TypeSystemPlugin {
  return {
    name: 'FakePlugin',
    version: '1.0.0',
    registerSchema(): void {},
    getSchema(typeId: string): unknown {
      return registered.get(typeId);
    },
    register(): void {},
    isTypeOf(typeId: string, baseTypeId: string): boolean {
      return typeId === baseTypeId || typeId.startsWith(baseTypeId);
    },
    validateInstance() {
      return { valid: true, errors: [] };
    },
    resolveLoadExtActionId: () => 'mock.action.v1~load_ext.v1~',
    resolveMountExtActionId: () => 'mock.action.v1~mount_ext.v1~',
    resolveUnmountExtActionId: () => 'mock.action.v1~unmount_ext.v1~',
    resolveLifecycleStageInitId: () => 'mock.stage.v1~init.v1',
    resolveLifecycleStageActivatedId: () => 'mock.stage.v1~activated.v1',
    resolveLifecycleStageDeactivatedId: () => 'mock.stage.v1~deactivated.v1',
    resolveLifecycleStageDestroyedId: () => 'mock.stage.v1~destroyed.v1',
  };
}

const registeredManifests = new Map<string, unknown>();
const registryTypeSystem = createFakeTypeSystem(registeredManifests);
// Registered manifests never leak from one test into the next.
afterEach(resetRegisteredManifests);

/** Forget every registered manifest. */
function resetRegisteredManifests(): void {
  registeredManifests.clear();
}

/** Register `manifest` under its id and return that id — what an entry holds. */
export function registerManifest(manifest: MfManifest): string {
  registeredManifests.set(manifest.id, manifest);
  return manifest.id;
}

/** A handler registered into the fixture registry. */
export function newHandler(
  ...args: ConstructorParameters<typeof MfeHandlerMF>
): MfeHandlerMF {
  const handler = new MfeHandlerMF(...args);
  handler.attachTypeSystem(registryTypeSystem);
  return handler;
}
