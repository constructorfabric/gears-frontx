/**
 * Default Mount Manager Implementation
 *
 * Concrete mount manager that handles MFE loading, mounting, and unmounting
 * with full lifecycle support.
 *
 * @packageDocumentation
 * @internal
 */
// @cpt-algo:cpt-frontx-algo-extension-domain-governance-mount-execution:p2
// @cpt-state:cpt-frontx-state-extension-domain-governance-admission:p1
// @cpt-dod:cpt-frontx-dod-extension-domain-governance-default-deny:p1

import type { ChildMfeBridge } from '../handler/ChildMfeBridge';
import type { MfeHandler, MfeMountContext } from '../handler/MfeHandler';
import type { ParentMfeBridge } from '../handler/ParentMfeBridge';
import type { TypeSystemPlugin } from '../type-substrate';
import type { RuntimeCoordinator } from './coordination/RuntimeCoordinator';
import type { ActionHandler } from '../mediator/ActionHandler';
import type { ActionsChain } from '../types';
import { DefaultExtensionManager } from './DefaultExtensionManager';
import type { MfeRegistry } from '../registry/MfeRegistry';
import { MountManager } from './MountManager';
import type { ActionsChainDispatcher, LifecycleTrigger } from './MountManager';
import { RuntimeBridgeFactory } from './RuntimeBridgeFactory';
import { createShadowRoot } from '../shadow';
import {
  popAmbientMountingBridge,
  pushAmbientMountingBridge,
  registerInboundBridgeLink,
  type InboundBridgeLink,
  type InboundBridgeRelink,
} from './inbound-bridge-link';
import type { RouterPort } from '../router/RouterPort';
import {
  associateOccupantValue,
  readOccupantValue,
  releaseOccupantValue,
} from './occupant-value-rendezvous';

export type HandlerResolver = (entryTypeId: string) => MfeHandler | undefined;

export class DefaultMountManager extends MountManager {
  private readonly extensionManager: DefaultExtensionManager;
  private readonly resolveHandler: HandlerResolver;
  private readonly coordinator: RuntimeCoordinator;
  private readonly typeSystem: TypeSystemPlugin;
  private readonly triggerLifecycle: LifecycleTrigger;
  /**
   * The registry's `executeActionsChain` — wired to the child bridge's
   * public capability (`dispatchActionsChain` param of `acquireBridge`)
   * (`cpt-frontx-adr-mfe-runtime-public-surface`).
   */
  private readonly dispatchActionsChain: ActionsChainDispatcher;
  private readonly hostRuntime: MfeRegistry;
  private readonly registerExtensionActionHandler: (extensionId: string, actionTypeId: string, handler: ActionHandler, domainId: string) => void;
  private readonly unregisterExtensionActionHandler: (extensionId: string) => void;
  private readonly bridgeFactory: RuntimeBridgeFactory;
  private readonly buildInboundBridgeLink: (
    extensionId: string,
    childBridge: ChildMfeBridge,
    parentBridge: ParentMfeBridge
  ) => InboundBridgeLink;
  private readonly retractInboundBridgeLink: (childBridge: ChildMfeBridge) => void;
  /** The router snapshotted by the factory, or `undefined` for a standalone registry. */
  private readonly router: RouterPort | undefined;
  /**
   * Reads this registry's own inbound bridge, if any — the enclosing-value
   * key for `assignOccupantValue` (`inst-ov-enclosing-value`). Threaded in
   * the same way as `buildInboundBridgeLink`/`retractInboundBridgeLink`
   * rather than as a new method on `MfeRegistry` or `DefaultMfeRegistry`.
   */
  private readonly getInboundBridge: () => ChildMfeBridge | undefined;

  /**
   * The `ChildMfeBridge` whose inbound link is registered for each extension,
   * set at the first mount after each registration and deleted by
   * `releaseExtension`. Distinct from an extension's retained bridge pair on
   * `ExtensionState`: this map tracks the one bridge object a descendant
   * registry may have propagated advertisements through, so
   * `releaseExtension` can trigger parent-owned retraction
   * (`inst-retract-advertisements`) for it.
   */
  private readonly childBridgesByExtension = new Map<string, ChildMfeBridge>();

  /**
   * The re-link callbacks of the registries that adopted an inbound link in
   * the latest mount window that produced a claim, keyed by extension id. A
   * fresh claim replaces the entry (unlinking the adopters it supersedes).
   * `releaseExtension` unlinks the adopters (`relink(null)`) but keeps the
   * entry, so the next mount after re-registration re-offers them the current
   * link. An ordinary unmount leaves the entry unchanged.
   */
  private readonly inboundAdoptersByExtension = new Map<string, readonly InboundBridgeRelink[]>();

  /**
   * The in-flight `loadExtension` promise for an extension currently in
   * `loadState === 'loading'`, keyed by extension id. A second concurrent
   * `loadExtension` call for the same extension awaits this promise instead
   * of returning immediately, so it observes the same completion (or
   * failure) as the original caller rather than resolving before the load
   * has actually finished.
   */
  private readonly inFlightLoadsByExtension = new Map<string, Promise<void>>();

  /**
   * The in-flight `mountExtension` promise for an extension currently in
   * `mountState === 'mounting'`, keyed by extension id. A second concurrent
   * `mountExtension` call for the same extension awaits this promise instead
   * of starting a second mount, so both callers observe the same mounted
   * bridge (or the same failure) rather than one racing past the other's
   * still-in-progress mount work.
   */
  private readonly inFlightMountsByExtension = new Map<string, Promise<ParentMfeBridge>>();

  constructor(config: {
    extensionManager: DefaultExtensionManager;
    resolveHandler: HandlerResolver;
    coordinator: RuntimeCoordinator;
    typeSystem: TypeSystemPlugin;
    triggerLifecycle: LifecycleTrigger;
    dispatchActionsChain: ActionsChainDispatcher;
    hostRuntime: MfeRegistry;
    registerExtensionActionHandler: (extensionId: string, actionTypeId: string, handler: ActionHandler, domainId: string) => void;
    unregisterExtensionActionHandler: (extensionId: string) => void;
    bridgeFactory: RuntimeBridgeFactory;
    buildInboundBridgeLink: (
      extensionId: string,
      childBridge: ChildMfeBridge,
      parentBridge: ParentMfeBridge
    ) => InboundBridgeLink;
    retractInboundBridgeLink: (childBridge: ChildMfeBridge) => void;
    router?: RouterPort;
    getInboundBridge: () => ChildMfeBridge | undefined;
  }) {
    super();
    this.extensionManager = config.extensionManager;
    this.resolveHandler = config.resolveHandler;
    this.coordinator = config.coordinator;
    this.typeSystem = config.typeSystem;
    this.triggerLifecycle = config.triggerLifecycle;
    this.dispatchActionsChain = config.dispatchActionsChain;
    this.hostRuntime = config.hostRuntime;
    this.registerExtensionActionHandler = config.registerExtensionActionHandler;
    this.unregisterExtensionActionHandler = config.unregisterExtensionActionHandler;
    this.bridgeFactory = config.bridgeFactory;
    this.buildInboundBridgeLink = config.buildInboundBridgeLink;
    this.retractInboundBridgeLink = config.retractInboundBridgeLink;
    this.router = config.router;
    this.getInboundBridge = config.getInboundBridge;
  }

  async loadExtension(extensionId: string): Promise<void> {
    const extensionState = this.extensionManager.getExtensionState(extensionId);
    if (!extensionState) {
      throw new Error(
        `Cannot load extension '${extensionId}': extension is not registered. ` +
        `Call registerExtension() first.`
      );
    }

    if (extensionState.loadState === 'loaded') {
      return;
    }
    if (extensionState.loadState === 'loading') {
      const inFlight = this.inFlightLoadsByExtension.get(extensionId);
      if (inFlight) {
        return inFlight;
      }
      // Defensive fallback: `loadState` is 'loading' but no in-flight promise
      // is tracked (should not happen via this class's own code paths). Fall
      // through and start a fresh load rather than returning prematurely.
    }

    extensionState.loadState = 'loading';
    extensionState.error = undefined;

    // `.finally()`'s callback is always scheduled as a microtask
    // continuation of the async IIFE's own promise, which cannot run before
    // the synchronous `.set()` call below executes -- so there is no window
    // where a concurrent caller observing `loadState === 'loading'` would
    // fail to find a corresponding map entry.
    const loadPromise = (async (): Promise<void> => {
      try {
        const entry = extensionState.entry;
        const handler = this.resolveHandler(entry.id);
        if (!handler) {
          throw new Error(
            `No MFE handler registered that can handle entry type '${entry.id}'. ` +
            `Provide handlers via 'mfeHandlers' in MfeRegistryConfig.`
          );
        }

        const lifecycle = await handler.load(entry, extensionState.extension.id);
        extensionState.lifecycle = lifecycle;
        extensionState.loadState = 'loaded';
      } catch (error) {
        extensionState.loadState = 'error';
        extensionState.error = error instanceof Error ? error : new Error(String(error));
        throw error;
      }
    })().finally(() => {
      this.inFlightLoadsByExtension.delete(extensionId);
    });
    this.inFlightLoadsByExtension.set(extensionId, loadPromise);

    return loadPromise;
  }

  async preloadExtension(extensionId: string): Promise<void> {
    return this.loadExtension(extensionId);
  }

  // @cpt-begin:cpt-frontx-state-extension-domain-governance-admission:p1:inst-adm-t5
  // @cpt-begin:cpt-frontx-state-extension-domain-governance-admission:p1:inst-adm-t11
  // A fresh mount that reaches this method — because the mount-ext prologue
  // (`MountExtActionHandler`) found the extension neither already mounted nor
  // in-flight, including one that proceeded after an in-progress unmount
  // just settled — is an ordinary ADMITTED -> MOUNTED transition through
  // this same method: it re-enters MOUNTED under `inst-adm-t5` below and
  // triggers `activated` again (`inst-me-activated-once`).
  async mountExtension(
    extensionId: string,
    container: Element
  ): Promise<ParentMfeBridge> {
    const extensionState = this.extensionManager.getExtensionState(extensionId);
    if (!extensionState) {
      throw new Error(
        `Cannot mount extension '${extensionId}': extension is not registered. ` +
        `Call registerExtension() first.`
      );
    }

    if (extensionState.mountState === 'mounted') {
      return extensionState.bridge!;
    }

    if (extensionState.mountState === 'mounting') {
      const inFlight = this.inFlightMountsByExtension.get(extensionId);
      if (inFlight) {
        return inFlight;
      }
      // Defensive fallback: `mountState` is 'mounting' but no in-flight
      // promise is tracked (should not happen via this class's own code
      // paths). Fall through and start a fresh mount rather than returning
      // prematurely.
    }

    extensionState.mountState = 'mounting';
    extensionState.error = undefined;

    // `.finally()`'s callback is always scheduled as a microtask
    // continuation of the async IIFE's own promise, which cannot run before
    // the synchronous `.set()` call below executes -- so there is no window
    // where a concurrent caller observing `mountState === 'mounting'` would
    // fail to find a corresponding map entry.
    const mountPromise = (async (): Promise<ParentMfeBridge> => {
      // Declared here (not inside the `try` below) so the `catch` can also
      // see whichever bridge was actually acquired before the failure, if
      // any.
      let acquiredParentBridge: ParentMfeBridge | undefined;

      try {
        if (extensionState.loadState !== 'loaded') {
          await this.loadExtension(extensionId);
        }

        const domainState = this.extensionManager.getDomainState(extensionState.extension.domain);
        if (!domainState) {
          throw new Error(
            `Cannot mount extension '${extensionId}': ` +
            `domain '${extensionState.extension.domain}' is not registered.`
          );
        }

        const existing =
          extensionState.bridge && extensionState.childBridge
            ? { parentBridge: extensionState.bridge, childBridge: extensionState.childBridge }
            : undefined;

        const { parentBridge, childBridge } = this.bridgeFactory.acquireBridge(
          domainState,
          extensionId,
          existing,
          (chain: ActionsChain) => this.dispatchActionsChain(chain),
          (extId, actionTypeId, handler, domainId) => this.registerExtensionActionHandler(extId, actionTypeId, handler, domainId)
        );
        acquiredParentBridge = parentBridge;

        extensionState.bridge = parentBridge;
        extensionState.childBridge = childBridge;

        const existingConnection = this.coordinator.get(container);
        if (existingConnection) {
          existingConnection.bridges.set(extensionId, parentBridge);
        } else {
          this.coordinator.register(container, {
            hostRuntime: this.hostRuntime,
            bridges: new Map([[extensionId, parentBridge]]),
          });
        }

        const hostElement = container as HTMLElement;
        const shadowRoot = createShadowRoot(hostElement);
        extensionState.shadowRoot = shadowRoot;

        const lifecycle = extensionState.lifecycle;
        if (!lifecycle) {
          throw new Error(
            `Cannot mount extension '${extensionId}': lifecycle not loaded. ` +
            `This should not happen - loadExtension should have cached the lifecycle.`
          );
        }
        const mountContext: MfeMountContext = {
          extensionId,
          domainId: extensionState.extension.domain,
        };

        // @cpt-algo:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-assign
        // After the bridge pair is acquired for this mount and before the
        // lifecycle mount runs: obtain this extension's occupant value from
        // the router, keyed by this registry's own inbound bridge for the
        // enclosing value (`inst-ov-enclosing-value`). A throw here fails
        // the mount before `lifecycle.mount` is invoked — the existing
        // catch below deactivates the acquired bridge exactly as any other
        // pre-lifecycle failure does (`inst-ov-assign-failure`).
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-standalone
        // `this.router` is `undefined` for a standalone registry, so this
        // whole branch is skipped: nothing is assigned and nothing is
        // associated — the extension mounts exactly as it would with no
        // occupant-value rendezvous at all.
        if (this.router) {
          // @cpt-begin:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-enclosing-value
          // `undefined` when this registry holds no inbound bridge (a root
          // registry — `getInboundBridge()` returns `undefined`), when no
          // value is associated with it, or when this copy backed away from
          // the rendezvous (`readOccupantValue` returns `undefined` in both
          // of those last two cases).
          const enclosingValue = readOccupantValue(this.getInboundBridge());
          // @cpt-end:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-enclosing-value
          // @cpt-begin:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-assign-failure
          // A throw here propagates out of this `try` block unchanged,
          // reaching the same `catch` that handles every other pre-lifecycle
          // mount failure below: `mountState` moves to 'error', the acquired
          // bridge is deactivated, and no occupant value is associated —
          // `lifecycle.mount` is never reached.
          const occupantValue = this.router.assignOccupantValue({
            domain: domainState.domain,
            extension: extensionState.extension,
            enclosingValue,
          });
          // @cpt-end:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-assign-failure
          // @cpt-begin:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-set-before-mount
          associateOccupantValue(childBridge, occupantValue);
          // @cpt-end:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-set-before-mount
        }
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-standalone
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-assign

        // Prepare the link a nested registry constructed synchronously inside
        // this extension's own `mount()` body will automatically adopt, then
        // track `childBridge` as the ambient mounting bridge for exactly the
        // synchronous portion of the `lifecycle.mount(...)` invocation below —
        // no configuration or method call required from the microfrontend
        // author. Minted per registration, at the first mount after each
        // registration: the link (and the bridge it is attached to) serves
        // every later mount until `releaseExtension` retracts it.
        let mintedLink: InboundBridgeLink | undefined;
        if (!this.childBridgesByExtension.has(extensionId)) {
          mintedLink = this.buildInboundBridgeLink(extensionId, childBridge, parentBridge);
          registerInboundBridgeLink(childBridge, mintedLink);
          this.childBridgesByExtension.set(extensionId, childBridge);
        }

        // Adopters retained from this extension's previous registration are
        // handed the freshly minted link before the window opens, so the
        // navigation reader sees the associated value.
        const retainedAdopters = this.inboundAdoptersByExtension.get(extensionId);
        if (mintedLink && retainedAdopters) {
          // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-reoffer-retained-adoption
          // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-reoffer-hand-link
          for (const relink of retainedAdopters) {
            relink(mintedLink);
          }
          // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-reoffer-hand-link
          // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-reoffer-retained-adoption
        }

        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-track-mounting-bridge
        pushAmbientMountingBridge(childBridge);
        let mountInvocation: void | Promise<void>;
        try {
          mountInvocation = lifecycle.mount(shadowRoot, childBridge, mountContext);
        } finally {
          const claimed = popAmbientMountingBridge();
          // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-record-claims-on-mount-throw
          // Claims are recorded even when `lifecycle.mount` throws
          // synchronously; the error then propagates unchanged.
          // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-relink-repropagate
          if (claimed.length > 0) {
            // A registry constructed inside this window adopted the link
            // itself, which supersedes whatever the previous record holds.
            // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-unlink-on-retraction
            const superseded = this.inboundAdoptersByExtension.get(extensionId);
            if (superseded) {
              for (const relink of superseded) {
                relink(null);
              }
            }
            // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-unlink-on-retraction
            this.inboundAdoptersByExtension.set(extensionId, claimed);
          }
          // else: nothing claimed in this window; the record is untouched.
          // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-relink-repropagate
          // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-record-claims-on-mount-throw
        }
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-track-mounting-bridge

        await mountInvocation;

        extensionState.container = container;
        // @cpt-begin:cpt-frontx-state-extension-domain-governance-admission:p1:inst-adm-t8
        // ADMITTED -> MOUNTED is decided HERE, by the strategy's own mount
        // execution completing without error — nothing about a triggered
        // stage's chain (which has not even been dispatched yet at this
        // line) participates in this decision. The mirror image is
        // `inst-adm-t6` above/below: ADMITTED -> REJECTED is decided by
        // this SAME mount execution failing, never by a chain outcome.
        extensionState.mountState = 'mounted';
        // @cpt-end:cpt-frontx-state-extension-domain-governance-admission:p1:inst-adm-t8

        // @cpt-begin:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-sites
        // @cpt-begin:cpt-frontx-state-extension-domain-governance-admission:p1:inst-adm-t7
        // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-activated-once
        // Non-blocking: the `activated` stage is triggered alongside mount
        // completion — a notification the mount happened, not a phase the
        // mount waits on. `mountState` is already 'mounted' and the bridge
        // already returned to the caller below, regardless of whether any
        // `activated` hook's chain is still executing. This call is never awaited
        // and this method offers its triggered chain(s) no window and no
        // ordering guarantee relative to this transition's own completion.
        // This line runs at most once per physical mount: the mount-ext
        // prologue (`MountExtActionHandler`) never reaches a strategy's mount
        // body — and therefore never reaches this method — for an
        // already-mounted, joined, or still-occupant-at-turn request, so it
        // is never reached twice for the same physical mount. A fresh mount
        // that proceeds after an in-progress unmount settled runs this
        // method again from the top, so `activated` fires again for that
        // new physical mount. In an Optional or Exclusive domain, an entry
        // that finds its subject still the domain's occupant at its own
        // turn (`inst-me-sole-occupant-at-turn`) is handled entirely by the
        // prologue's own at-turn evaluation, before this method is ever
        // reached, so no additional `activated` trigger is produced for it
        // either.
        this.triggerLifecycle(
          extensionId,
          this.typeSystem.resolveLifecycleStageActivatedId()
        );
        // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-activated-once
        // @cpt-end:cpt-frontx-state-extension-domain-governance-admission:p1:inst-adm-t7
        // @cpt-end:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-sites

        return parentBridge;
      } catch (error) {
        // @cpt-begin:cpt-frontx-state-extension-domain-governance-admission:p1:inst-adm-t6
        extensionState.mountState = 'error';
        extensionState.error = error instanceof Error ? error : new Error(String(error));
        // @cpt-end:cpt-frontx-state-extension-domain-governance-admission:p1:inst-adm-t6

        // Mount-failure path: deactivate (not retract/destroy) the acquired
        // bridge — its advertisements, if any were propagated by a nested
        // registry constructed before the failure, stay recorded, and the
        // next mount attempt reactivates the same bridge.
        if (acquiredParentBridge) {
          this.bridgeFactory.deactivateBridge(acquiredParentBridge);
        }

        throw error;
      }
    })().finally(() => {
      this.inFlightMountsByExtension.delete(extensionId);
    });
    this.inFlightMountsByExtension.set(extensionId, mountPromise);

    return mountPromise;
  }
  // @cpt-end:cpt-frontx-state-extension-domain-governance-admission:p1:inst-adm-t11
  // @cpt-end:cpt-frontx-state-extension-domain-governance-admission:p1:inst-adm-t5

  // @cpt-begin:cpt-frontx-state-extension-domain-governance-admission:p1:inst-adm-t10
  async unmountExtension(extensionId: string): Promise<void> {
    const extensionState = this.extensionManager.getExtensionState(extensionId);
    if (!extensionState) {
      return;
    }

    // Every unmount_ext reaches this method only after any in-progress mount
    // of the same extension has settled, so mountState is never 'mounting'
    // here through the ordered path. In a Concurrent domain this guarantee
    // is enforced by `UnmountExtActionHandler`
    // (`cpt-frontx-algo-extension-domain-governance-mount-execution`
    // `inst-um-await-mount-settle`), which awaits the `ConcurrentMountJoiner`'s
    // in-flight mount for this same extension id BEFORE calling into the
    // strategy's `unmount` body that ultimately reaches this method. In an
    // Optional domain the occupancy queue orders an unmount behind a running
    // mount instead (`inst-me-queue-enter-pending`). By the time this method
    // runs, that mount has already settled to 'mounted' (normal unmount
    // below) or to 'error' (this early return, correctly reporting nothing
    // to unmount). A caller that bypasses the prologue and invokes this
    // method directly while a mount is still in
    // flight is outside that guarantee.
    if (extensionState.mountState !== 'mounted') {
      return;
    }

    // @cpt-begin:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-sites
    // Non-blocking: the `deactivated` stage is triggered alongside unmount
    // — a notification the unmount is happening, not a phase it waits on.
    // The unmount work below proceeds independently of any `deactivated`
    // hook's chain.
    this.triggerLifecycle(
      extensionId,
      this.typeSystem.resolveLifecycleStageDeactivatedId()
    );
    // @cpt-end:cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering:p1:inst-algo-lst-sites

    // The extension's own lifecycle unmount is awaited in its own try/catch
    // so a rejection here does not skip the teardown below — every physical
    // unmount completes bridge deactivation and coordinator cleanup even
    // when this call fails, then fails with that captured error afterward
    // (`inst-um-teardown-on-failure`).
    let failure: { error: unknown } | undefined;
    const container = extensionState.container;
    try {
      const lifecycle = extensionState.lifecycle;
      if (lifecycle && container) {
        const unmountTarget = extensionState.shadowRoot ?? container;
        await lifecycle.unmount(unmountTarget);
      }
    } catch (error) {
      failure = { error };
    }

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-um-failure-bridge-released
    try {
      // Deactivate (not destroy) the bridge: every advertisement propagated
      // through it stays recorded, and every action-delivery path through it
      // now rejects explicitly until the next mount reactivates it
      // (`inst-bridge-deactivation`). Handler registrations and property
      // subscriptions made through the bridge are untouched.
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-bridge-deactivation
      if (extensionState.bridge) {
        this.bridgeFactory.deactivateBridge(extensionState.bridge);
      }
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-bridge-deactivation

      if (container) {
        const connection = this.coordinator.get(container);
        if (connection) {
          connection.bridges.delete(extensionId);
          if (connection.bridges.size === 0) {
            this.coordinator.unregister(container);
          }
        }
      }
    } catch (cleanupError) {
      // The lifecycle unmount's own failure, if any, is what the caller
      // sees — a failure of this cleanup itself is captured only when
      // nothing failed yet.
      failure = failure ?? { error: cleanupError };
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-um-failure-bridge-released

    // MOUNTED -> ADMITTED (or ERROR): the extension stays admitted/registered
    // (`extensionState` is untouched otherwise). Its container and shadow
    // root are always released — whether this unmount was an explicit
    // `unmount_ext`, an OptionalMountStrategy displacement, an
    // ExclusiveMountStrategy eviction, or a slot detach, and whether or not
    // the lifecycle unmount or the teardown above failed.
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-um-teardown-on-failure
    extensionState.container = null;
    extensionState.shadowRoot = undefined;
    if (failure) {
      extensionState.mountState = 'error';
      extensionState.error = failure.error instanceof Error ? failure.error : new Error(String(failure.error));
      throw failure.error;
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-um-teardown-on-failure
    extensionState.mountState = 'unmounted';
    extensionState.error = undefined;
  }
  // @cpt-end:cpt-frontx-state-extension-domain-governance-admission:p1:inst-adm-t10

  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-retract-advertisements
  releaseExtension(extensionId: string): void {
    const childBridge = this.childBridgesByExtension.get(extensionId);
    if (childBridge) {
      this.retractInboundBridgeLink(childBridge);
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-unlink-on-retraction
      const adopters = this.inboundAdoptersByExtension.get(extensionId);
      if (adopters) {
        for (const relink of adopters) {
          relink(null);
        }
      }
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-unlink-on-retraction
    }

    const extensionState = this.extensionManager.getExtensionState(extensionId);
    if (extensionState?.bridge) {
      const domainState = this.extensionManager.getDomainState(extensionState.extension.domain);
      if (domainState) {
        this.bridgeFactory.destroyBridge(domainState, extensionState.bridge);
      }
    }

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-release-with-bridge
    // The bridge pair is released here (unregistration or registry
    // disposal) — an ordinary unmount or a failed mount never reaches
    // this method, so the association survives both, exactly as
    // specified.
    releaseOccupantValue(extensionState?.childBridge ?? undefined);
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-release-with-bridge

    try {
      this.unregisterExtensionActionHandler(extensionId);
    } catch (unregisterError) {
      console.error(
        `[MountManager] Failed to unregister extension action handler for '${extensionId}':`,
        unregisterError
      );
    }

    this.childBridgesByExtension.delete(extensionId);

    if (extensionState) {
      extensionState.bridge = null;
      extensionState.childBridge = null;
    }
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-retract-advertisements

  setTheme(_cssVars: Record<string, string>): void {
    // No-op: CSS custom properties inherit across Shadow DOM boundaries
  }
}
