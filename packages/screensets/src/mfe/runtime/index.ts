/**
 * MFE Runtime - MfeRegistry Factory and Configuration
 *
 * Registry contracts and runtime abstractions are now in @gears-frontx/mfes.
 * Re-exported here for backward compatibility. Screensets-specific concrete
 * implementations (DefaultMfeRegistry, DefaultMfeRegistryFactory) remain internal.
 *
 * @packageDocumentation
 */

import { DefaultMfeRegistryFactory } from './DefaultMfeRegistryFactory';
import type { MfeRegistryFactory } from '@gears-frontx/mfes';

export { MfeRegistry } from '@gears-frontx/mfes';
export { MfeRegistryFactory } from '@gears-frontx/mfes';
export type { MfeRegistryConfig } from '@gears-frontx/mfes';

// Mount strategy abstractions and shipped implementations
export { MountStrategy } from '@gears-frontx/mfes';
export type { ContainerHooks, ActionPayload } from '@gears-frontx/mfes';
export { ConcurrentMountStrategy, OptionalMountStrategy, ExclusiveMountStrategy } from '@gears-frontx/mfes';

// Domain implementation abstractions
export { ExtensionDomainImplementation } from '@gears-frontx/mfes';
export { ExtensionDomainImplementationFactory } from '@gears-frontx/mfes';
export { ExtensionMounter } from '@gears-frontx/mfes';
export { DomainLifecycleTrigger } from '@gears-frontx/mfes';

// DomainContext interface (domain authors see only the interface)
export type { DomainContext } from '@gears-frontx/mfes';

/**
 * Singleton MfeRegistryFactory instance.
 *
 * This is the primary way to obtain a MfeRegistry instance.
 * The factory accepts configuration (including TypeSystemPlugin) and returns
 * the registry singleton. After the first build(), subsequent calls return
 * the cached instance.
 *
 * @example
 * ```typescript
 * import { mfeRegistryFactory, gtsPlugin } from '@gears-frontx/screensets';
 *
 * const registry = mfeRegistryFactory.build({ typeSystem: gtsPlugin });
 * registry.registerDomain(myDomain, new MyDomainFactory());
 * await registry.registerExtension(myExtension);
 * ```
 */
export const mfeRegistryFactory: MfeRegistryFactory = new DefaultMfeRegistryFactory();
