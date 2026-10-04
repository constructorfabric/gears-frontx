/**
 * DefaultMfeRegistry - Concrete MFE Runtime Implementation
 *
 * This is the DEFAULT concrete implementation of MfeRegistry.
 * It wires all collaborators together and implements the facade API.
 *
 * INTERNAL: This class is NOT exported from the public barrel.
 * External consumers obtain instances via createMfeRegistryFactory().build(config).
 *
 * @packageDocumentation
 * @internal
 */
// @cpt-algo:cpt-frontx-algo-mfe-registry-handler-resolution:p1
// @cpt-dod:cpt-frontx-dod-mfe-registry-handler-injection:p1
// @cpt-dod:cpt-frontx-dod-mfe-registry-registry-contract:p1
// @cpt-dod:cpt-frontx-dod-mfe-registry-router-admission:p1

import type { TypeSystemPlugin } from '../type-substrate';
import { MfeRegistry } from '../registry/MfeRegistry';
import type { MfeRegistryConfig } from './config';
import type { ChildMfeBridge } from '../handler/ChildMfeBridge';
import type { MfeHandler } from '../handler/MfeHandler';
import type { ParentMfeBridge } from '../handler/ParentMfeBridge';
import type { ExtensionDomain, Extension, ActionsChain } from '../types';
import type { ExtensionDomainImplementationFactory } from './ExtensionDomainImplementationFactory';
import type { ExtensionMounter } from './ExtensionMounter';
import { DefaultActionsChainsMediator } from '../mediator/DefaultActionsChainsMediator';
import { CROSS_HOP_PROTOCOL_VERSION, CrossHopRoute, type CrossHopEnvelope } from '../mediator/CrossHopRoute';
import { RuntimeCoordinator } from './coordination/RuntimeCoordinator';
import { InvalidatableDomainContext } from './InvalidatableDomainContext';
import { ConcurrentMountStrategy } from './ConcurrentMountStrategy';
import { OptionalMountStrategy } from './OptionalMountStrategy';
import { ExclusiveMountStrategy } from './ExclusiveMountStrategy';
import { WeakMapRuntimeCoordinator } from './coordination/WeakMapRuntimeCoordinator';
import { type ExtensionDomainState } from './ExtensionManager';
import { DefaultExtensionManager } from './DefaultExtensionManager';
import { DefaultLifecycleManager } from './DefaultLifecycleManager';
import { MountManager } from './MountManager';
import { DefaultMountManager } from './DefaultMountManager';
import { OperationSerializer } from './OperationSerializer';
import { RuntimeBridgeFactory } from './RuntimeBridgeFactory';
import { DefaultRuntimeBridgeFactory } from './DefaultRuntimeBridgeFactory';
import { LoadExtHandler } from './LoadExtHandler';
import { EntryTypeNotHandledError, DomainUnregisteringError, DomainValidationError } from '../errors';
import { extractGtsPackage } from '../gts/extract-package';
import { DefaultExtensionMounter } from './DefaultExtensionMounter';
import { ExtensionReleaserProvider } from './ExtensionReleaserProvider';
import { MountExtActionHandler } from './MountExtActionHandler';
import { UnmountExtActionHandler } from './UnmountExtActionHandler';
import { DomainOccupancyCoordinator } from './DomainOccupancyCoordinator';
import { ConcurrentMountJoiner } from './ConcurrentMountJoiner';
import { ActionTimeoutResolver } from '../mediator/ActionTimeoutResolver';
import { DefaultDomainLifecycleTrigger } from './DefaultDomainLifecycleTrigger';
import { ParentMfeBridgeImpl } from '../bridge/ParentMfeBridgeImpl';
import { BridgeInactiveError } from '../bridge/errors';
import {
  adoptAmbientInboundBridgeLink,
  tagArrivalEdge,
  unregisterInboundBridgeLink,
  type InboundBridgeLink,
} from './inbound-bridge-link';
import type { RouterPort } from '../router/RouterPort';
import { readOccupantValue } from './occupant-value-rendezvous';

/**
 * A `ChildMfeBridge` this registry has produced (via `buildInboundBridgeLinkFor`)
 * an `InboundBridgeLink` for. Keyed by the bridge object itself, since a
 * `ChildMfeBridge` from an independently loaded copy of this package cannot be
 * identified any other way. The stored callback flips `revoked` on the
 * closures already handed out for that bridge, making a retained reference to
 * a revoked link inert (`inst-revoked-link-inert`) — a defense-in-depth layer
 * independent of, and in addition to, `relinkInboundBridge(null)`.
 */
type LinkRevoker = () => void;

/**
 * A downward forwarding entry recorded when a descendant registry propagates
 * an advertisement for one of its admitted targets through registration
 * propagation (`cpt-frontx-algo-mfe-host-communication-registration-propagation`).
 *
 * @internal
 */
interface ForwardingEntry {
  /** The bridge the advertisement arrived on — the loop-containment identity. */
  readonly edge: ChildMfeBridge;
  /** Hands a versioned cross-hop envelope down through that bridge to the
   * descendant registry: throws to refuse, or returns having accepted. */
  readonly sendDown: (envelope: CrossHopEnvelope) => void;
}

/** A `ChildMfeBridge` that also exposes the concrete-only `onCrossHopEnvelope` hook. */
interface CrossHopEnvelopeReceivingBridge extends ChildMfeBridge {
  onCrossHopEnvelope(handler: (envelope: CrossHopEnvelope) => void): () => void;
}

/**
 * Structural (duck-typed) check for the bridge's own internal `isActive()`,
 * for the same cross-copy reason as `hasOnCrossHopEnvelopeMethod` above: the
 * bridge escalating through this link may belong to a different,
 * independently loaded copy of this package than the one running this
 * check.
 */
// @cpt-begin:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-bridge-deactivation
function isActiveBridge(bridge: ChildMfeBridge): boolean {
  const candidate = bridge as unknown as { isActive?: () => boolean };
  return typeof candidate.isActive === 'function' ? candidate.isActive() : true;
}
// @cpt-end:cpt-frontx-algo-mfe-host-communication-bridge-delegation:p1:inst-bridge-deactivation

/**
 * Default concrete implementation of MfeRegistry.
 *
 * This class extends the abstract MfeRegistry and provides the full
 * implementation by wiring together all collaborator classes.
 *
 * Key Responsibilities:
 * - Collaborator initialization and wiring
 * - Delegation to collaborators for specialized logic
 * - Concurrency control via OperationSerializer
 * - Error handling and logging
 *
 * @internal
 */

export class DefaultMfeRegistry extends MfeRegistry {
  /**
   * Structural (duck-typed) check for `onCrossHopEnvelope`, deliberately NOT
   * `instanceof ChildMfeBridgeImpl`: the bridge adopted from the ambient
   * mounting-bridge rendezvous may have been constructed by a different,
   * independently loaded copy of this package than the one running this
   * check (`cpt-frontx-adr-mfe-load-isolation`), so the two sides cannot rely
   * on sharing a class definition — only on the bridge object's own shape.
   * Pure and stateless — no substitution is ever needed for this
   * recognition — so it is a private static method.
   */
  private static hasOnCrossHopEnvelopeMethod(
    bridge: ChildMfeBridge
  ): bridge is CrossHopEnvelopeReceivingBridge {
    return typeof (bridge as unknown as { onCrossHopEnvelope?: unknown }).onCrossHopEnvelope === 'function';
  }

  /**
   * Type System plugin instance.
   * All type validation and schema operations go through this plugin.
   */
  public readonly typeSystem: TypeSystemPlugin;


  /**
   * Extension manager for managing extension and domain state.
   */
  private readonly extensionManager: DefaultExtensionManager;

  /**
   * Lifecycle manager for triggering lifecycle stages.
   */
  private readonly lifecycleManager: DefaultLifecycleManager;

  /**
   * Mount manager for loading and mounting MFEs.
   */
  private readonly mountManager: MountManager;

  /**
   * Runtime bridge factory for creating bridge connections.
   */
  private readonly bridgeFactory: RuntimeBridgeFactory;

  /**
   * Runtime coordinator for managing runtime connections.
   */
  private readonly coordinator: RuntimeCoordinator;

  /**
   * Actions chains mediator. Held as the concrete type for the internal
   * member this registry wires: `receiveHandedOverChain`.
   */
  private readonly mediator: DefaultActionsChainsMediator;

  /**
   * The one shared per-action timeout rule — the SAME instance injected into
   * `this.mediator` and handed to every domain's own internal mount/unmount
   * handlers, so the mediator's own per-action bound and the occupancy
   * queue's per-caller timer apply the identical rule
   * (`cpt-frontx-algo-mfe-host-communication-mediator-dispatch`
   * `inst-resolve-timeout`).
   */
  private readonly actionTimeoutResolver: ActionTimeoutResolver;

  /**
   * Every registered Optional/Exclusive domain's own occupancy queue, keyed
   * by domain id — populated in `registerDomain` once cross-validation
   * succeeds, and removed once `unregisterDomain` (or `dispose`) tears the
   * domain down, so this map never outlives the domain it belongs to.
   */
  private readonly occupancyCoordinatorsByDomain = new Map<string, DomainOccupancyCoordinator>();

  /**
   * Domain ids currently inside `unregisterDomain`, from the moment
   * unregistration starts until the domain id is fully freed (even on
   * failure) — closes `registerExtension` to that domain id for the
   * duration, so a registration racing the drain loop's final empty query
   * can never be admitted against a domain state `unregisterDomain` then
   * removes (`cpt-frontx-algo-mfe-registry-domain-unregister-closes-admission`
   * `inst-algo-du-close-first`).
   */
  private readonly domainsUnregistering = new Set<string>();

  /**
   * Operation serializer for per-entity concurrency control.
   */
  private readonly operationSerializer: OperationSerializer;

  /**
   * Registered MFE handlers.
   */
  private readonly handlers: MfeHandler[] = [];

  /**
   * This registry's link to its immediate parent registry, through the
   * bridge its own host extension received at mount time (the "inbound
   * bridge") — automatically adopted in the constructor via ambient
   * mount-context discovery (`inst-adopt-ambient-bridge`), never via a
   * config field or method call. `null` for a root/shell registry.
   *
   * This is the mechanism that makes cross-nesting reachability work: a
   * registry constructed synchronously inside an extension's own `mount()`
   * body automatically gains a channel to propagate advertisements upward,
   * escalate unresolved dispatches upward, and retract advertisements on
   * disposal — all without any growth to the public surface (MFES-6).
   */
  private inboundBridgeLink: InboundBridgeLink | null = null;

  /** Unsubscribe for the automatic downward actions-chain delivery wired in the constructor. */
  private inboundActionsChainUnsubscribe: (() => void) | null = null;

  /**
   * Downward forwarding entries this registry holds for targets advertised
   * by a descendant registry through registration propagation, keyed by
   * target id (`cpt-frontx-algo-mfe-host-communication-registration-propagation`).
   */
  private readonly forwardingEntries = new Map<string, ForwardingEntry>();

  /**
   * Target ids this registry itself has successfully propagated upward
   * through its own inbound bridge — tracked so disposal/unregistration can
   * retract exactly what was propagated (`inst-retract-advertisements`).
   */
  private readonly propagatedTargetIds = new Set<string>();

  /**
   * Every target this registry would advertise if linked — its own admitted
   * domains and extensions, by target id. Populated on admission regardless of whether
   * this registry currently holds an inbound bridge, and consulted by
   * `repropagateThroughInboundBridge` so a re-link (`relinkInboundBridge`)
   * re-advertises every target this registry still holds, not merely the ones
   * it happened to hold at the moment of its ORIGINAL link.
   */
  private readonly advertisableTargets = new Set<string>();

  /**
   * The revoker for each `InboundBridgeLink` this registry has minted, keyed
   * by the `ChildMfeBridge` it was minted for. Flipped by
   * `retractInboundBridgeLinkFor` so a reference to that link retained beyond
   * retraction — by any copy of the runtime — can never again propagate,
   * retract, or escalate (`inst-revoked-link-inert`), independent of and in
   * addition to `relinkInboundBridge(null)` on the child side.
   */
  private readonly linkRevokersByBridge = new WeakMap<ChildMfeBridge, LinkRevoker>();

  /**
   * GTS package to extension ID mappings.
   */
  private readonly packages = new Map<string, Set<string>>();

  /**
   * Set by `dispose()`. A disposed registry refuses every hand-over across a
   * hop (`inst-receive-refusal-check`).
   */
  private disposed = false;

  /**
   * The router snapshotted by the factory, or `undefined` for a standalone
   * registry (`cpt-frontx-dod-mfe-registry-router-configuration`). Every
   * `if (this.router)` branch in this class is skipped entirely when this is
   * `undefined`, leaving a standalone registry's behavior unchanged
   * (`inst-algo-ra-standalone`).
   */
  private readonly router: RouterPort | undefined;

  /**
   * Extension and domain ids this registry's router actually admitted —
   * populated only on a successful `router.registerExtension`/`registerDomain`
   * call — so release notifications (`releaseExtension`/`releaseDomain`) are
   * sent only for what the router admitted, never for a registration it
   * never saw or rejected (`cpt-frontx-algo-mfe-registry-router-admission`).
   */
  private readonly routerAdmittedExtensionIds = new Set<string>();
  private readonly routerAdmittedDomainIds = new Set<string>();

  constructor(config: MfeRegistryConfig) {
    super();

    if (!config.typeSystem) {
      throw new Error(
        'MfeRegistry requires a TypeSystemPlugin. ' +
        'Provide it via config.typeSystem parameter. ' +
        'Use createMfeRegistryFactory().build({ typeSystem: gtsPlugin }) to create an instance.'
      );
    }

    this.typeSystem = config.typeSystem;
    // @cpt-begin:cpt-frontx-flow-mfe-registry-factory-build:p2:inst-flow-fb-standalone
    // `undefined` when the factory's config omitted `router`: every
    // `if (this.router)` branch in this class is then skipped for this
    // registry's whole life — it presents no registration, sends no
    // release notification, assigns no occupant value, and reports no
    // settled action to anyone.
    this.router = config.router;
    // @cpt-end:cpt-frontx-flow-mfe-registry-factory-build:p2:inst-flow-fb-standalone

    this.operationSerializer = new OperationSerializer();
    this.coordinator = new WeakMapRuntimeCoordinator();
    // Composition-root-owned (DIP): constructed here rather than left to
    // `DefaultRuntimeBridgeFactory`'s own hard-coded default, so this
    // registry is the one place substituting the route factory would
    // happen.
    this.bridgeFactory = new DefaultRuntimeBridgeFactory();

    // Shared by the mediator and every domain's mount/unmount handlers.
    this.actionTimeoutResolver = new ActionTimeoutResolver();

    this.mediator = new DefaultActionsChainsMediator({
      typeSystem: this.typeSystem,
      getDomainState: (domainId) => this.extensionManager.getDomainState(domainId),
      getExtensionEntry: (extensionId) =>
        this.extensionManager.getExtensionState(extensionId)?.entry,
      resolveForwardingEntry: (targetId, arrivalEdge) =>
        this.resolveForwardingEntryRoute(targetId, arrivalEdge),
      resolveEscalation: () => this.resolveEscalationRoute(),
      actionTimeoutResolver: this.actionTimeoutResolver,
    });

    this.extensionManager = new DefaultExtensionManager({
      typeSystem: this.typeSystem,
      // Internal lifecycle trigger — bypasses the public surface (removed in spec v1.6).
      triggerLifecycle: (extensionId, stageId) =>
        this.triggerLifecycleStageInternal(extensionId, stageId),
      triggerDomainOwnLifecycle: (domainId, stageId) =>
        this.triggerDomainOwnLifecycleStageInternal(domainId, stageId),
      // Bypass OperationSerializer: the parent operation (unregisterExtension)
      // already holds the serializer lock for this entity ID, so we cannot
      // re-enter registry.executeActionsChain. Routing through the per-domain
      // DefaultExtensionMounter keeps mount-set bookkeeping (removeMountedExtension)
      // and DOM container teardown centralized while still avoiding the lock.
      unmountExtension: (extensionId) => this.bypassUnmountExtension(extensionId),
      releaseExtension: (extensionId) => this.mountManager.releaseExtension(extensionId),
      validateEntryType: (entryTypeId) => this.validateEntryType(entryTypeId),
      router: this.router,
    });

    this.lifecycleManager = new DefaultLifecycleManager(
      this.extensionManager,
      (chain) => this.executeActionsChain(chain)
    );

    this.mountManager = new DefaultMountManager({
      extensionManager: this.extensionManager,
      resolveHandler: (entryTypeId) => this.resolveHandler(entryTypeId),
      coordinator: this.coordinator,
      typeSystem: this.typeSystem,
      triggerLifecycle: (extensionId, stageId) =>
        this.triggerLifecycleStageInternal(extensionId, stageId),
      dispatchActionsChain: (chain) => this.executeActionsChain(chain),
      hostRuntime: this,
      registerExtensionActionHandler: (extensionId, actionTypeId, handler, domainId) =>
        this.mediator.registerHandler(extensionId, actionTypeId, handler, domainId),
      unregisterExtensionActionHandler: (extensionId) =>
        this.mediator.unregisterAllHandlers(extensionId),
      bridgeFactory: this.bridgeFactory,
      buildInboundBridgeLink: (extensionId, childBridge, parentBridge) =>
        this.buildInboundBridgeLinkFor(extensionId, childBridge, parentBridge),
      retractInboundBridgeLink: (childBridge) =>
        this.retractInboundBridgeLinkFor(childBridge),
      router: this.router,
      getInboundBridge: () => this.inboundBridgeLink?.edge,
    });

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-adopt-ambient-bridge
    // Automatic ambient adoption: if a mount is synchronously in progress and
    // the extension being mounted is itself constructing this registry, adopt
    // that extension's bridge as this registry's inbound bridge — no config
    // field, no method call, no author action (`inst-inbound-bridge-auto-adopt`).
    // The published `relink` callback is how the mount manager's retention
    // record re-links this registry instance: unlinked when the host
    // extension is unregistered, and handed the current link on the next
    // mount after re-registration
    // (`inst-publish-relink-callback`). If no
    // mount's ambient bridge is tracked, this registry adopts nothing and
    // `relinkInboundBridge(null)` behaves as a root/shell registry
    // (`inst-no-ambient-bridge` / `inst-registry-is-root`).
    const adopted = adoptAmbientInboundBridgeLink((link) => this.relinkInboundBridge(link));
    this.relinkInboundBridge(adopted ?? null);
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-adopt-ambient-bridge

    if (config.mfeHandlers) {
      for (const handler of config.mfeHandlers) {
        // @cpt-begin:cpt-frontx-algo-mfe-registry-handler-resolution:p1:inst-algo-hr-attach-type-system
        // Handlers are constructed by the host application, which has no
        // registry yet and therefore no plugin to hand them. Registration is
        // where the two meet: without this, a handler resolving a reference
        // the type system owns (a manifest named by id) has nothing to ask.
        handler.attachTypeSystem(this.typeSystem);
        // @cpt-end:cpt-frontx-algo-mfe-registry-handler-resolution:p1:inst-algo-hr-attach-type-system
        this.handlers.push(handler);
      }
      // @cpt-begin:cpt-frontx-algo-mfe-registry-handler-resolution:p1:inst-algo-hr-01
      this.handlers.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
      // @cpt-end:cpt-frontx-algo-mfe-registry-handler-resolution:p1:inst-algo-hr-01
    }
  }

  // ─── Cross-nesting reachability: propagation, escalation, retraction ──────
  // @cpt-algo:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2

  /**
   * The ONE place this registry's inbound-bridge link state changes — used
   * both by the constructor's initial ambient adoption and by the mount
   * manager's retention record (unlink on unregistration or supersession,
   * re-offer on a later mount). A no-op if `link` is already this registry's
   * current link.
   *
   * @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-relink-repropagate
   */
  private relinkInboundBridge(link: InboundBridgeLink | null): void {
    if (this.inboundBridgeLink === link) return; // already the current link

    this.inboundActionsChainUnsubscribe?.();
    this.inboundActionsChainUnsubscribe = null;
    this.propagatedTargetIds.clear();

    // The previous link, if any, is replaced; this acts on the route only
    // (`inst-retract-advertisements`).
    this.inboundBridgeLink = link;
    if (!link) return;

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-relink-downward-delivery
    // Duck-typed, NOT `instanceof ChildMfeBridgeImpl`: this bridge may have
    // been constructed by a different, independently loaded copy of this
    // package than the one currently executing (the extension that is
    // mounting this registry may be a nested MFE, itself evaluating its own
    // copy) — the two sides need not, and generally will not, share a class
    // definition, so identity can only be established structurally.
    if (DefaultMfeRegistry.hasOnCrossHopEnvelopeMethod(link.edge)) {
      // Automatic downward delivery: a hand-over through the inbound bridge
      // lands on `receiveCrossHopNode`, with no registration call required
      // from the microfrontend author. Re-established on every re-link.
      this.inboundActionsChainUnsubscribe = link.edge.onCrossHopEnvelope((envelope) =>
        this.receiveCrossHopNode(envelope, true)
      );
    }
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-relink-downward-delivery

    this.repropagateThroughInboundBridge();

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-supply-navigation
    // Called once per adoption of an inbound bridge by a registry built with
    // a router — never for a root registry (no `link` above) and never for
    // a standalone one (no router).
    if (this.router) {
      this.router.supplyNavigation(() => readOccupantValue(this.inboundBridgeLink?.edge));
    }
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-occupant-value-rendezvous:p1:inst-ov-supply-navigation
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-relink-repropagate

  /**
   * Re-advertise, through this registry's (newly re-linked) inbound bridge,
   * every target this registry currently holds: each domain and extension
   * admitted to it directly, and every forwarding entry it holds on behalf
   * of its own descendants. Called only from `relinkInboundBridge`, after
   * the link is already in place, so `propagateAdvertisementUpward`'s own
   * already-propagated guard (`propagatedTargetIds`) governs whether any given
   * target actually re-propagates further.
   */
  private repropagateThroughInboundBridge(): void {
    for (const targetId of this.advertisableTargets) {
      this.propagateAdvertisementUpward(targetId);
    }
    for (const targetId of this.forwardingEntries.keys()) {
      this.propagateAdvertisementUpward(targetId);
    }
  }

  /**
   * Build the `InboundBridgeLink` a nested registry — one constructed
   * synchronously inside this extension's own `mount()` body — will
   * automatically adopt as its inbound bridge. Called by `DefaultMountManager`
   * right before invoking `lifecycle.mount(...)`.
   *
   * `inst-inbound-bridge-internal` is a surface-shape claim about the
   * abstract `ChildMfeBridge` contract, marked at its declaration in
   * `handler/ChildMfeBridge.ts` rather than here.
   */
  private buildInboundBridgeLinkFor(
    extensionId: string,
    childBridge: ChildMfeBridge,
    parentBridge: ParentMfeBridge
  ): InboundBridgeLink {
    const sendDown = (envelope: CrossHopEnvelope): void => {
      if (!(parentBridge instanceof ParentMfeBridgeImpl)) {
        throw new Error(`Internal: expected a ParentMfeBridgeImpl for extension '${extensionId}'`);
      }
      parentBridge.sendCrossHopEnvelope(envelope);
    };

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-revoked-link-inert
    // Defense-in-depth (Layer 2): revocation-inertness on the closures
    // themselves, independent of `relinkInboundBridge(null)` on the child
    // side. `retractInboundBridgeLinkFor` flips `revoked` via the stored
    // revoker, so even a reference to this exact link object retained past
    // retraction — by any copy of the runtime, including one that never
    // observes the child-side unlink — can never again propagate, retract,
    // or escalate through the disposed bridge.
    let revoked = false;
    this.linkRevokersByBridge.set(childBridge, () => { revoked = true; });

    return {
      edge: childBridge,
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-propagate-upward
      propagateAdvertisement: (targetId) =>
        revoked ? false : this.admitAdvertisement(targetId, childBridge, sendDown),
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-propagate-upward
      retractAdvertisement: (targetId) => {
        if (!revoked) this.retractForwardingEntry(targetId, childBridge);
      },
      // Calls `tagArrivalEdge` (realizes inst-tag-arrival-edge; canonical
      // marker kept at that function's definition in inbound-bridge-link.ts
      // to avoid a second code location for the same instruction ID).
      // Minted and executed entirely on THIS (the parent) registry's own
      // side, using this copy's own `tagArrivalEdge`/`getArrivalEdge` pair —
      // never the child's — so the tag is visible to this same registry's
      // own `resolveHandler` regardless of whether the child that escalated
      // through this link is evaluating a different, independently loaded
      // copy of this package (`inst-mint-escalation-on-link`).
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-escalation-lookup
      escalate: (envelope) => {
        if (revoked) {
          throw new Error(`Inbound bridge link for '${extensionId}' has been revoked.`);
        }
        if (!isActiveBridge(childBridge)) {
          throw new BridgeInactiveError(extensionId);
        }
        tagArrivalEdge(envelope.chain.action, childBridge);
        // Throws to refuse, or returns having accepted.
        this.receiveCrossHopNode(envelope);
      },
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-escalation-lookup
    };
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-revoked-link-inert
  }

  /**
   * Receiving-ancestor side of propagation: admit (or reject) an advertisement
   * from a descendant registry.
   *
   * @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-collision-check
   */
  private admitAdvertisement(
    targetId: string,
    edge: ChildMfeBridge,
    sendDown: (envelope: CrossHopEnvelope) => void
  ): boolean {
    const hasLocalTarget =
      !!this.extensionManager.getDomainState(targetId) ||
      !!this.extensionManager.getExtensionState(targetId);
    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-readvertise-same-edge
    // A re-statement of a live registration on the SAME edge is not a
    // collision — it is exactly what a re-link's `repropagateThroughInboundBridge`
    // produces when the descendant registry that owns this forwarding entry
    // is itself re-linked and re-advertises. The guard below means a
    // DIFFERENT owner, not merely a repeat advertisement.
    const existing = this.forwardingEntries.get(targetId);
    if (existing && existing.edge === edge) {
      return true;
    }
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-readvertise-same-edge
    if (hasLocalTarget || this.forwardingEntries.has(targetId)) {
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-collision-reject
      console.error(
        `[DefaultMfeRegistry] Advertisement collision for target '${targetId}': ` +
        'an ancestor already holds a local registration or a forwarding entry ' +
        'for this identifier. Rejecting the advertisement — it will not be reachable ' +
        'through this path.'
      );
      return false;
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-collision-reject
    }
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-collision-check

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-no-collision
    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-record-forwarding-entry
    this.forwardingEntries.set(targetId, { edge, sendDown });
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-record-forwarding-entry

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-repropagate-upward
    this.propagateAdvertisementUpward(targetId);
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-repropagate-upward
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-no-collision
    return true;
  }

  /**
   * Compose and propagate an advertisement for a locally-admitted target
   * upward through this registry's inbound bridge, if it has one.
   */
  private propagateAdvertisementUpward(targetId: string): void {
    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-has-inbound-bridge
    // Same check, shared by two call sites: step 6's own-advertisement
    // propagation and step 8.2's re-propagation of an admitted descendant
    // advertisement — both ask the identical question ("does THIS registry
    // itself have an inbound bridge to propagate through?"), so both
    // instructions map onto this one guard.
    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-ancestor-has-inbound-bridge
    if (!this.inboundBridgeLink) {
      return; // Root/shell registry — nothing further to propagate to.
    }
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-ancestor-has-inbound-bridge
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-has-inbound-bridge
    if (this.propagatedTargetIds.has(targetId)) {
      // Already propagated through the current link (e.g. a post-relink explicit
      // re-registration by the author) — do not double-advertise.
      return;
    }
    const accepted = this.inboundBridgeLink.propagateAdvertisement(targetId);
    if (accepted) {
      this.propagatedTargetIds.add(targetId);
    }
  }

  /**
   * Retract a target this registry itself previously propagated upward
   * (called from `unregisterDomain`/`unregisterExtension`/`dispose`).
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-retract-advertisements
  private retractPropagatedTarget(targetId: string): void {
    if (this.propagatedTargetIds.delete(targetId) && this.inboundBridgeLink) {
      this.inboundBridgeLink.retractAdvertisement(targetId);
    }
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-retract-advertisements

  /**
   * Receiving-ancestor side of retraction: drop a forwarding entry this
   * registry holds for a descendant's target, then re-propagate the
   * retraction further up if this registry itself has an inbound bridge.
   * Acts on the route only: a sub-chain the far side already accepted
   * through this entry keeps executing there (`inst-retract-advertisements`).
   */
  private retractForwardingEntry(targetId: string, edge: ChildMfeBridge): void {
    const entry = this.forwardingEntries.get(targetId);
    if (!entry || entry.edge !== edge) {
      return; // Not ours (already retracted, or belongs to a different edge).
    }
    this.forwardingEntries.delete(targetId);
    if (this.inboundBridgeLink) {
      this.inboundBridgeLink.retractAdvertisement(targetId);
    }
  }

  /**
   * Parent-triggered retraction (`inst-retract-advertisements`): revoke every
   * forwarding entry this registry holds that was propagated through a
   * SPECIFIC descendant's inbound bridge — called by `DefaultMountManager`
   * only from `releaseExtension` (the destroy path, when the extension is
   * unregistered), never from an ordinary unmount or a mount failure: those
   * two instead deactivate the acquired bridge (`bridgeFactory.deactivateBridge`),
   * leaving this registry's forwarding entries and inbound link intact so a
   * later remount resumes delivery on the same bridge. This retraction runs
   * regardless of whether the nested registry that extension hosts ever
   * disposes itself. After this runs, the parent's own forwarding-entry
   * state for that bridge is fully clean, so a later registration of the
   * extension re-advertises without collision, and a retained child
   * registry's own further attempts to propagate or retract through its
   * now-revoked link simply fail to find an entry to
   * touch here — never crash, never resurrect stale routing.
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-retract-advertisements
  private retractInboundBridgeLinkFor(childBridge: ChildMfeBridge): void {
    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-revoked-link-inert
    // Flip this bridge's revoker FIRST — before any of the retraction below —
    // so the link's own closures refuse to act even if something concurrent
    // (a race between this retraction and an in-flight call through the
    // still-referenced link) reaches them mid-retraction.
    this.linkRevokersByBridge.get(childBridge)?.();
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-revoked-link-inert
    for (const [targetId, entry] of Array.from(this.forwardingEntries.entries())) {
      if (entry.edge === childBridge) {
        this.retractForwardingEntry(targetId, childBridge);
      }
    }
    // Once retraction of any entries keyed to this bridge is complete, drop
    // the Symbol-keyed `InboundBridgeLink` attached to the bridge object
    // itself — otherwise the bridge keeps a strong reference back into this
    // registry's closures (`escalate`/`propagateAdvertisement` capture
    // `this`) even after the link has been fully retracted.
    unregisterInboundBridgeLink(childBridge);
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-retract-advertisements

  /**
   * Mediator-injected tier-2 resolution: a downward forwarding entry for
   * `targetId`, excluding one whose bridge equals the chain's tagged arrival
   * edge (loop containment).
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-forwarding-entry-lookup
  private resolveForwardingEntryRoute(targetId: string, arrivalEdge: unknown): CrossHopRoute | undefined {
    const entry = this.forwardingEntries.get(targetId);
    if (!entry) {
      return undefined;
    }
    if (arrivalEdge !== undefined && entry.edge === arrivalEdge) {
      return undefined;
    }
    return new CrossHopRoute(entry.sendDown);
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-forwarding-entry-lookup

  /**
   * Mediator-injected tier-3 resolution: the escalation route bound to this
   * registry's inbound bridge. `undefined` when this registry holds no
   * inbound bridge (it is the shell). Arrival-edge tagging is NOT done here
   * — it happens inside `link.escalate` itself, minted by the PARENT
   * registry at link time (`buildInboundBridgeLinkFor`), so that the tag is
   * written and later read by the same (parent) copy of this package
   * regardless of which copy this (child) registry belongs to.
   *
   * Deliberately target-blind by design: by the time the mediator's
   * escalation tier runs, tiers 1-2 have already exhausted every way THIS
   * registry could resolve the target locally. A nested registry structurally
   * cannot know what an ancestor registry holds — so escalation always tries
   * upward regardless of which target failed to resolve here. Not needing
   * `targetId` is not an oversight; it reflects that structural blindness.
   *
   * @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-escalation-lookup
   */
  private resolveEscalationRoute(): CrossHopRoute | undefined {
    const link = this.inboundBridgeLink;
    if (!link) {
      return undefined;
    }
    return new CrossHopRoute((envelope) => link.escalate(envelope));
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-escalation-lookup

  // ─── Private lifecycle trigger helpers ─────────────────────────────────────

  /**
   * Internal: trigger a lifecycle stage for a specific extension.
   * Used by collaborators that hold no public method of their own for it.
   */
  private triggerLifecycleStageInternal(extensionId: string, stageId: string): void {
    this.lifecycleManager.triggerLifecycleStage(extensionId, stageId);
  }

  /**
   * Internal: auto-unmount path used by `DefaultExtensionManager.unregisterExtension`.
   *
   * Resolves the extension's domain, then releases it through
   * `ExtensionReleaserProvider.for(mounter)` — the same route an ordinary
   * `unmount_ext` action takes — so mount-set bookkeeping
   * (`removeMountedExtension`), `MountManager.unmountExtension`, AND the
   * container destroy registered by the mount strategy that created it
   * (`ContainerHooks.destroy`, via `ExtensionReleaser.registerDestroy`) all
   * run for this extension, exactly as they do for any other unmount.
   *
   * The serializer lock for this extension is already held by the parent
   * `unregisterExtension` operation; the mounter does not re-acquire it, so
   * no deadlock is possible.
   */
  private async bypassUnmountExtension(extensionId: string): Promise<void> {
    const extState = this.extensionManager.getExtensionState(extensionId);
    if (!extState) {
      return;
    }
    const domainState = this.extensionManager.getDomainState(extState.extension.domain);
    const mounter = domainState?.mounter;
    if (mounter) {
      await ExtensionReleaserProvider.for(mounter).release(extensionId);
      return;
    }
    await this.mountManager.unmountExtension(extensionId);
  }

  /**
   * Internal: trigger a lifecycle stage on the domain entity itself.
   */
  private triggerDomainOwnLifecycleStageInternal(domainId: string, stageId: string): void {
    this.lifecycleManager.triggerDomainOwnLifecycleStage(domainId, stageId);
  }

  // ─── Entry type validation ────────────────────────────────────────────────

  private validateEntryType(entryTypeId: string): void {
    if (this.handlers.length === 0) {
      return;
    }

    // @cpt-begin:cpt-frontx-algo-mfe-registry-handler-resolution:p1:inst-algo-hr-03
    // No handler covers the entry type after evaluating all → resolution failure.
    const canHandle = this.handlers.some(handler =>
      this.typeSystem.isTypeOf(entryTypeId, handler.handledBaseTypeId)
    );
    if (!canHandle) {
      throw new EntryTypeNotHandledError(
        entryTypeId,
        this.handlers.map(h => h.handledBaseTypeId)
      );
    }
    // @cpt-end:cpt-frontx-algo-mfe-registry-handler-resolution:p1:inst-algo-hr-03
  }

  private resolveHandler(entryTypeId: string): MfeHandler | undefined {
    // @cpt-begin:cpt-frontx-algo-mfe-registry-handler-resolution:p1:inst-algo-hr-02b
    // Iterate handlers (already priority-sorted) and return the first whose
    // handled base type matches the entry type through the injected type system.
    return this.handlers.find(handler =>
      this.typeSystem.isTypeOf(entryTypeId, handler.handledBaseTypeId)
    );
    // @cpt-end:cpt-frontx-algo-mfe-registry-handler-resolution:p1:inst-algo-hr-02b
  }

  // ─── registerDomain ───────────────────────────────────────────────────────

  /**
   * Register an extension domain.
   */
  registerDomain(
    declaration: ExtensionDomain,
    factory: ExtensionDomainImplementationFactory
  ): void {
    // An already-registered id is refused before anything is changed or
    // presented to the router; the live registration stays as it is.
    if (this.extensionManager.getDomainState(declaration.id)) {
      throw new DomainValidationError(
        declaration.id,
        new Error(`domain '${declaration.id}' is already registered`)
      );
    }

    // Step 1: Validate lifecycle hooks and store initial (in-memory, fully
    // reversible) domain state — no init trigger yet, and no type-system
    // registration yet either: that runs only after router admission,
    // below (`inst-domain-type-register`).
    this.extensionManager.registerDomain(declaration);

    // Step 2: Construct per-domain mounter and lifecycle trigger.
    const mounter = new DefaultExtensionMounter(
      declaration.id,
      this.mountManager,
      (domainId, extId) => this.extensionManager.addMountedExtension(domainId, extId),
      (domainId, extId) => this.extensionManager.removeMountedExtension(domainId, extId),
      (domainId) => this.extensionManager.getMountedExtensions(domainId)
    );
    const lifecycleTrigger = new DefaultDomainLifecycleTrigger(declaration.id, this.lifecycleManager);

    // Step 3: Build DomainContext and pre-populate LoadExtHandler.
    const ctx = new InvalidatableDomainContext(mounter, lifecycleTrigger, this.typeSystem);
    ctx.prepopulateHandler(
      this.typeSystem.resolveLoadExtActionId(),
      new LoadExtHandler(this.operationSerializer, this.mountManager)
    );

    // Step 4: Invoke factory (try/finally for rollback + ctx invalidation).
    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-compose-domain
    let implementation;
    try {
      implementation = factory.build(ctx);
    } catch (error) {
      // Atomic rollback: clear any partially-registered handlers and remove domain.
      ctx.clearCollectedHandlers();
      this.extensionManager.unregisterDomain(declaration.id).catch(() => { /* best-effort */ });
      throw error;
    } finally {
      // Function-handle-level invalidation: after build() returns (or throws),
      // any subsequent access to ctx.mounter / ctx.lifecycleTrigger / ctx.registerHandler
      // — including captured function handles — throws.
      ctx.invalidate();
    }
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-compose-domain

    // Step 5: Cross-validate handlers vs declaration AND strategy/cardinality matrix.
    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-cardinality-check
    // @cpt-begin:cpt-frontx-state-extension-domain-governance-cardinality:p2:inst-card-t1
    const mountStrategies = implementation._getMountStrategiesInternal();
    try {
      this.crossValidateHandlers(declaration, mountStrategies, ctx);
    } catch (error) {
      // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-cardinality-fail-check
      // @cpt-begin:cpt-frontx-state-extension-domain-governance-cardinality:p2:inst-card-t2
      ctx.clearCollectedHandlers();
      this.extensionManager.unregisterDomain(declaration.id).catch(() => { /* best-effort */ });
      // @cpt-end:cpt-frontx-state-extension-domain-governance-cardinality:p2:inst-card-t2
      // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-cardinality-fail-check
      // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-cardinality-reject
      // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-reg-fail
      throw error;
      // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-reg-fail
      // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-cardinality-reject
    }
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-cardinality-check

    // @cpt-algo:cpt-frontx-algo-mfe-registry-router-admission:p1
    // @cpt-flow:cpt-frontx-flow-extension-domain-governance-admission:p1
    // @cpt-begin:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-present-domain
    // @cpt-begin:cpt-frontx-flow-mfe-registry-register-validate-mount:p1:inst-flow-rvm-router-domain
    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-router-admission
    // The runtime's own NON-PERSISTING checks (lifecycle-hook validation,
    // domain-implementation construction, and the strategy and cardinality
    // cross-validation above) have all passed; nothing below this point has
    // registered the declaration with the type system, persisted handlers to
    // the mediator, recorded the implementation, propagated an advertisement,
    // or triggered `init` yet. Type-system registration deliberately happens
    // AFTER router admission, not before (`inst-domain-type-register` below):
    // the provider's `register()` cannot validate without also persisting the
    // domain to the GtsStore (no validate-only call exists on the port), so
    // running it any earlier would leave a router-rejected domain durably
    // registered with the type system — the same partial-admission hazard
    // extensions avoid (`inst-algo-ra-present-extension`).
    // @cpt-begin:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-standalone
    // `this.router` is `undefined` for a standalone registry, so the
    // presentation, rejection rollback, and admission-tracking branch below
    // is skipped entirely; domain registration proceeds exactly as it would
    // with no router configured (`inst-algo-ra-standalone`).
    if (this.router) {
      try {
        // @cpt-begin:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-no-routing-grammar
        // `declaration` is handed to the router exactly as the runtime
        // holds it, `route` included and uninterpreted: the runtime derives
        // no routing token from it, validates no route name, and checks no
        // route uniqueness — that is the router's own concern.
        this.router.registerDomain(declaration);
        // @cpt-end:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-no-routing-grammar
        // @cpt-begin:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-return
        // Admitted: registration proceeds (no value returned to the
        // caller of `registerDomain`/`registerExtension` beyond success).
        this.routerAdmittedDomainIds.add(declaration.id);
        // @cpt-end:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-return
      } catch (error) {
        // @cpt-begin:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-domain-rejected
        // @cpt-begin:cpt-frontx-flow-mfe-registry-register-validate-mount:p1:inst-flow-rvm-router-domain-reject
        // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-router-reject
        // Roll back exactly like a cardinality rejection: nothing was yet
        // persisted beyond the in-progress registration discarded here —
        // the type system has not seen this declaration either, since that
        // registration comes after this point and is not reached.
        ctx.clearCollectedHandlers();
        this.extensionManager.unregisterDomain(declaration.id).catch(() => { /* best-effort */ });
        throw error;
        // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-router-reject
        // @cpt-end:cpt-frontx-flow-mfe-registry-register-validate-mount:p1:inst-flow-rvm-router-domain-reject
        // @cpt-end:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-domain-rejected
      }
    }
    // @cpt-end:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-standalone

    // @cpt-begin:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-domain-type-register
    // The router has admitted (or no router is injected): only now does the
    // declaration become visible to the type system. A schema-validation
    // failure here rolls back the same way a router rejection does — nothing
    // was yet persisted to the mediator, recorded, or advertised — but, since
    // the router may already have admitted this declaration above, this also
    // throws a `DomainValidationError` rather than the router's own error,
    // as this method does for any invalid domain.
    // The router admission itself must be released here too: it is tracked
    // (`routerAdmittedDomainIds`) only on a successful `router.registerDomain`
    // above, and nothing else in this method's failure paths frees it — a
    // left-behind admission would collide with a corrected retry under the
    // same domain id.
    try {
      this.typeSystem.register(declaration);
    } catch (cause) {
      // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-type-register-reject
      const err = cause instanceof Error ? cause : new Error(String(cause));
      this.releaseRouterDomain(declaration.id);
      ctx.clearCollectedHandlers();
      this.extensionManager.unregisterDomain(declaration.id).catch(() => { /* best-effort */ });
      throw new DomainValidationError(declaration.id, err);
      // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-type-register-reject
    }
    // @cpt-end:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-domain-type-register
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-router-admission
    // @cpt-end:cpt-frontx-flow-mfe-registry-register-validate-mount:p1:inst-flow-rvm-router-domain
    // @cpt-end:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-present-domain

    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-registered
    // @cpt-begin:cpt-frontx-state-extension-domain-governance-cardinality:p2:inst-card-t3
    // Step 6: Persist handlers to mediator. The domain's `mount_ext` handler
    // is wrapped with the strategy-agnostic
    // mount-execution prologue first, so eligibility, the already-mounted
    // short-circuit, in-progress-mount joining, in-progress-unmount waiting,
    // and — for Optional/Exclusive — the occupancy queue all run above every
    // strategy (`cpt-frontx-algo-extension-domain-governance-mount-execution`).
    //
    // A Concurrent domain (cross-validation above already rejected a domain
    // with zero strategies, and mixed-strategy domains are not supported, so
    // the first strategy is representative of the whole domain) is given a
    // `ConcurrentMountJoiner` — same-extension joining only, no
    // cross-extension ordering. An Optional or Exclusive domain is given a
    // `DomainOccupancyCoordinator` instead — its own two-slot occupancy
    // queue, shared by the `mount_ext` and `unmount_ext` handlers the domain
    // registers below, so joining, replacement, and at-turn evaluation hold
    // across both.
    const isConcurrent = mountStrategies[0] instanceof ConcurrentMountStrategy;
    const concurrentJoiner = isConcurrent ? new ConcurrentMountJoiner() : undefined;
    const queue = isConcurrent ? undefined : new DomainOccupancyCoordinator(declaration.id);
    if (queue) {
      this.occupancyCoordinatorsByDomain.set(declaration.id, queue);
    }
    const admissionReader = {
      domainOf: (extensionId: string) =>
        this.extensionManager.getExtensionState(extensionId)?.extension.domain,
    };
    const mountedReader = {
      isMounted: (extensionId: string) =>
        this.extensionManager.getMountedExtensions(declaration.id).includes(extensionId),
    };
    const domainReader = (): { id: string; defaultActionTimeout: number } | undefined =>
      this.extensionManager.getDomainState(declaration.id)?.domain;
    const mountExtActionId = this.typeSystem.resolveMountExtActionId();
    const unmountExtActionId = this.typeSystem.resolveUnmountExtActionId();
    for (const [actionType, handler] of ctx.getCollectedHandlers()) {
      let wrapped = handler;
      if (actionType === mountExtActionId) {
        wrapped = new MountExtActionHandler(
          handler,
          declaration.id,
          admissionReader,
          mountedReader,
          {
            inFlight: (extensionId) =>
              ExtensionReleaserProvider.for(mounter).inFlight(extensionId) ??
              mounter.getUnmountInFlight(extensionId),
          },
          this.actionTimeoutResolver,
          domainReader,
          queue,
          concurrentJoiner,
          this.router
        );
      } else if (actionType === unmountExtActionId) {
        wrapped = new UnmountExtActionHandler(
          handler,
          declaration.id,
          admissionReader,
          mountedReader,
          this.actionTimeoutResolver,
          domainReader,
          queue,
          concurrentJoiner,
          this.router
        );
      }
      this.mediator.registerHandler(declaration.id, actionType, wrapped);
    }

    // Step 7: Persist domain implementation references.
    this.extensionManager.setDomainImplementation(
      declaration.id,
      mounter,
      lifecycleTrigger,
      implementation
    );

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-compose-advertisement
    // Admission complete: record this domain as one of this registry's own
    // advertisable targets (regardless of whether it currently holds an
    // inbound bridge, so a later re-link can re-advertise it), then propagate
    // it upward if this registry has an inbound bridge to propagate through.
    this.advertisableTargets.add(declaration.id);
    this.propagateAdvertisementUpward(declaration.id);
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-compose-advertisement

    // Step 8: Non-blocking 'init' lifecycle stage trigger. The stage ID
    // comes from the injected plugin: MFES-1 forbids this package from
    // spelling a concrete type-format literal, and a consumer whose stages
    // live in another notation would otherwise never be matched. Void —
    // `triggerDomainOwnLifecycleStageInternal` hands each hook's chain to
    // `executeActionsChain` and returns without awaiting any of them.
    this.triggerDomainOwnLifecycleStageInternal(
      declaration.id,
      this.typeSystem.resolveLifecycleStageInitId()
    );
    // @cpt-end:cpt-frontx-state-extension-domain-governance-cardinality:p2:inst-card-t3
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-registered
    // @cpt-end:cpt-frontx-state-extension-domain-governance-cardinality:p2:inst-card-t1
  }

  /**
   * Cross-validate handlers vs declaration AND strategy/cardinality matrix.
   *
   * @throws {Error} on any violation.
   */
  // @cpt-algo:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1
  // @cpt-state:cpt-frontx-state-extension-domain-governance-cardinality:p2
  // @cpt-dod:cpt-frontx-dod-extension-domain-governance-cardinality-enforcement:p1
  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-identify-strategy
  private crossValidateHandlers(
    declaration: ExtensionDomain,
    strategies: import('./MountStrategy').MountStrategy[],
    ctx: InvalidatableDomainContext
  ): void {
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-no-strategy-reject
    if (strategies.length === 0) {
      throw new Error(
        `Domain '${declaration.id}': domain implementation must capture at least one MountStrategy instance.`
      );
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-no-strategy-reject

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-first-strategy-representative
    // Use the first strategy as the representative — mixed-strategy domains are not supported.
    const strategy = strategies[0];
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-first-strategy-representative
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-identify-strategy

    // Identify strategy class and look up cardinality row.
    let requireMount: boolean;
    let requireUnmount: boolean;
    let forbidUnmount: boolean;
    let strategyName: string;

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-match-strategy
    if (strategy instanceof ConcurrentMountStrategy) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-concurrent-row
      strategyName = 'ConcurrentMountStrategy';
      requireMount = true;
      requireUnmount = true;
      forbidUnmount = false;
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-concurrent-row
    } else if (strategy instanceof OptionalMountStrategy) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-optional-row
      strategyName = 'OptionalMountStrategy';
      requireMount = true;
      requireUnmount = true;
      forbidUnmount = false;
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-optional-row
    } else if (strategy instanceof ExclusiveMountStrategy) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-exclusive-row
      strategyName = 'ExclusiveMountStrategy';
      requireMount = true;
      requireUnmount = false;
      forbidUnmount = true;
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-exclusive-row
    } else {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-unknown-reject
      throw new Error(
        `Domain '${declaration.id}': unrecognized MountStrategy class. ` +
        'The cardinality matrix only handles ConcurrentMountStrategy, OptionalMountStrategy, and ExclusiveMountStrategy. ' +
        'Custom strategy classes are not supported (per ADR-0009).'
      );
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-unknown-reject
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-match-strategy

    const declaredActions = declaration.actions;

    // Resolve the framework's well-known lifecycle action IDs through the
    // injected plugin — the runtime never spells a concrete type-format
    // literal for these concepts (MFES-1).
    const mountExtActionId = this.typeSystem.resolveMountExtActionId();
    const unmountExtActionId = this.typeSystem.resolveUnmountExtActionId();

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-required-check-loop
    // Enforce REQUIRED actions in declaration.
    const hasMountExt = declaredActions.includes(mountExtActionId);
    const hasUnmountExt = declaredActions.includes(unmountExtActionId);
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-missing-required
    if (requireMount && !hasMountExt) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-required-fail
      throw new Error(
        `Domain '${declaration.id}': ${strategyName} requires '${mountExtActionId}' in declaration.actions.`
      );
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-required-fail
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-missing-required
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-missing-required
    if (requireUnmount && !hasUnmountExt) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-required-fail
      throw new Error(
        `Domain '${declaration.id}': ${strategyName} requires '${unmountExtActionId}' in declaration.actions.`
      );
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-required-fail
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-missing-required
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-required-check-loop

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-forbidden-check-loop
    // Enforce FORBIDDEN actions in declaration.
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-forbidden-present
    if (forbidUnmount && hasUnmountExt) {
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-forbidden-present
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-forbidden-fail
      throw new Error(
        `Domain '${declaration.id}': ${strategyName} forbids '${unmountExtActionId}' in declaration.actions, ` +
        `but declared action '${unmountExtActionId}' violates this rule.`
      );
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-forbidden-fail
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-forbidden-check-loop

    const collectedHandlers = ctx.getCollectedHandlers();

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-required-loop
    // Every action in declaration.actions must have a handler.
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-missing-check
    for (const actionType of declaredActions) {
      if (!collectedHandlers.has(actionType)) {
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-missing-check
        // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-missing-fail
        throw new Error(
          `Domain '${declaration.id}': declaration lists '${actionType}' but no handler was registered via ctx.registerHandler.`
        );
        // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-missing-fail
      }
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-required-loop

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-extra-loop
    // Every handler registered via ctx.registerHandler must be in
    // declaration.actions. Per the spec (inst-enforce-no-extra-handlers), this
    // check is scoped to handlers REGISTERED by the factory, not handlers
    // PREPOPULATED by the registry itself (e.g., the plugin-resolved 'load_ext'
    // action id supplied by LoadExtHandler injection). The registry-supplied handlers are infrastructure
    // and need not appear in declaration.actions for every domain.
    const prepopulated = ctx.getPrepopulatedActionTypes();
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-extra-check
    for (const [actionType] of collectedHandlers) {
      if (prepopulated.has(actionType)) continue;
      if (!declaredActions.includes(actionType)) {
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-extra-check
        // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-extra-fail
        throw new Error(
          `Domain '${declaration.id}': handler registered for '${actionType}' but '${actionType}' is not declared in declaration.actions.`
        );
        // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-extra-fail
      }
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-handler-extra-loop
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-accept
    // domain accepted — strategy registered as mount executor (implicit; execution continues in registerDomain)
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-accept
  }

  // ─── Execute actions chain ────────────────────────────────────────────────

  // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-mount-action
  /**
   * Execute an actions chain through this registry's mediator. Takes only
   * the chain and returns nothing awaitable.
   */
  // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-invoke-execute
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-accept-yields-nothing
  executeActionsChain(chain: ActionsChain): void {
    this.mediator.executeActionsChain(chain);
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-accept-yields-nothing
  // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-invoke-execute
  // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-mount-action

  /**
   * Receiving side of every hand-over into this registry — a downward
   * forwarding entry or an upward escalation. Refuses, with no side effect here, when the envelope carries a
   * version this copy does not recognize or this registry is disposed;
   * otherwise accepts, and the sub-chain executes after this call returns.
   * A chain handed down from the parent (`fromParent`) is never escalated.
   *
   * @throws {Error} to refuse the hand-over.
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-receive-hand-over
  private receiveCrossHopNode(envelope: CrossHopEnvelope, fromParent = false): void {
    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-receive-refusal-check
    if (envelope.version !== CROSS_HOP_PROTOCOL_VERSION || this.disposed) {
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-receive-refuse
      throw new Error(
        this.disposed
          ? 'Hand-over refused: this registry has been disposed.'
          : `Hand-over refused: unrecognized cross-hop envelope version ${String(envelope.version)}.`
      );
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-receive-refuse
    }
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-receive-refusal-check
    this.mediator.receiveHandedOverChain(envelope.chain, fromParent);
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-receive-hand-over

  // ─── Shared property ──────────────────────────────────────────────────────

  updateSharedProperty(propertyId: string, value: unknown): void {
    this.extensionManager.updateSharedProperty(propertyId, value);
  }

  getDomainProperty(domainId: string, propertyTypeId: string): unknown {
    return this.extensionManager.getDomainProperty(domainId, propertyTypeId);
  }

  // ─── Query ────────────────────────────────────────────────────────────────

  /**
   * Get the insertion-ordered list of currently-mounted extension IDs for a domain.
   */
  getMountedExtensions(domainId: string): readonly string[] {
    return this.extensionManager.getMountedExtensions(domainId);
  }

  /**
   * Returns the per-domain `ExtensionMounter` instance.
   * Called by the React `ExtensionDomainSlot` to call attach/detach.
   *
   * @throws {Error} if domain is not registered.
   */
  getMounter(domainId: string): ExtensionMounter {
    const state = this.extensionManager.getDomainState(domainId);
    if (!state || !state.mounter) {
      throw new Error(
        `getMounter: domain '${domainId}' is not registered or has no mounter. ` +
        'Call registerDomain before accessing the mounter.'
      );
    }
    return state.mounter;
  }

  getParentBridge(extensionId: string): ParentMfeBridge | null {
    return this.extensionManager.getExtensionState(extensionId)?.bridge ?? null;
  }

  // @cpt-flow:cpt-frontx-flow-mfe-registry-register-validate-mount:p1
  // @cpt-algo:cpt-frontx-algo-mfe-registry-register-extension:p2
  async registerExtension(extension: Extension): Promise<void> {
    return this.operationSerializer.serializeOperation(extension.id, async () => {
      // @cpt-begin:cpt-frontx-algo-mfe-registry-domain-unregister-closes-admission:p1:inst-algo-du-reject-registration
      // Checked before any other admission step — including the domain's
      // own presence, which `extensionManager.registerExtension` would
      // otherwise still find (that call is removed only once draining
      // completes), so a registration racing the drain loop's last empty
      // query is refused here instead of slipping through.
      // `registerExtension` is serialized per EXTENSION id, not per domain,
      // so this check is this guard's only enforcement point.
      if (this.domainsUnregistering.has(extension.domain)) {
        throw new DomainUnregisteringError(extension.domain, extension.id);
      }
      // @cpt-end:cpt-frontx-algo-mfe-registry-domain-unregister-closes-admission:p1:inst-algo-du-reject-registration

      // @cpt-begin:cpt-frontx-flow-mfe-registry-register-validate-mount:p1:inst-flow-rvm-05
      // An already-registered id is refused before anything is changed or
      // presented to the router; the registered extension stays as it is.
      if (this.extensionManager.getExtensionState(extension.id)) {
        throw new Error(`Extension '${extension.id}' is already registered.`);
      }

      // Developer-invoked registration of an Extension value: delegates entry
      // type-validation, handler resolution, and entry storage to the manager.
      await this.extensionManager.registerExtension(extension);
      // @cpt-end:cpt-frontx-flow-mfe-registry-register-validate-mount:p1:inst-flow-rvm-05

      // @cpt-begin:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-present-extension
      // The call above already presented this extension to the router,
      // inside `DefaultExtensionManager.registerExtension`, before its state
      // was stored — reaching this line at all means that call did not
      // throw, i.e. the router admitted it (or no router was injected).
      if (this.router) {
        this.routerAdmittedExtensionIds.add(extension.id);
      }
      // @cpt-end:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-present-extension

      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-compose-advertisement
      // Admission complete: record this extension as one of this registry's
      // own advertisable targets, then propagate its advertisement upward.
      this.advertisableTargets.add(extension.id);
      this.propagateAdvertisementUpward(extension.id);
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-compose-advertisement

      try {
        // @cpt-begin:cpt-frontx-algo-mfe-registry-register-extension:p2:inst-algo-re-05
        // Store the admitted extension in the registry's internal map keyed by id.
        const packageId = extractGtsPackage(extension.id);
        if (!this.packages.has(packageId)) {
          this.packages.set(packageId, new Set<string>());
        }
        this.packages.get(packageId)!.add(extension.id);
        // @cpt-end:cpt-frontx-algo-mfe-registry-register-extension:p2:inst-algo-re-05
      } catch {
        // Not a valid GTS ID — skip package tracking.
      }
    });
  }

  // @cpt-state:cpt-frontx-state-mfe-registry-entry-lifecycle:p2
  async unregisterExtension(extensionId: string): Promise<void> {
    return this.operationSerializer.serializeOperation(extensionId, async () => {
      // @cpt-begin:cpt-frontx-state-mfe-registry-entry-lifecycle:p2:inst-state-el-09
      // MOUNTED -> UNREGISTERED: extension is unmounted first, then removed.
      await this.extensionManager.unregisterExtension(extensionId);
      // @cpt-end:cpt-frontx-state-mfe-registry-entry-lifecycle:p2:inst-state-el-09

      // @cpt-begin:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-release-extension
      // @cpt-begin:cpt-frontx-state-mfe-registry-entry-lifecycle:p2:inst-state-el-10
      this.releaseRouterExtension(extensionId);
      // @cpt-end:cpt-frontx-state-mfe-registry-entry-lifecycle:p2:inst-state-el-10
      // @cpt-end:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-release-extension

      this.retractPropagatedTarget(extensionId);
      this.advertisableTargets.delete(extensionId);

      try {
        const packageId = extractGtsPackage(extensionId);
        const extensionSet = this.packages.get(packageId);
        if (extensionSet) {
          extensionSet.delete(extensionId);
          if (extensionSet.size === 0) {
            this.packages.delete(packageId);
          }
        }
      } catch {
        // Not a valid GTS ID — no package tracking to clean up.
      }
    });
  }

  async unregisterDomain(domainId: string): Promise<void> {
    return this.operationSerializer.serializeOperation(domainId, async () => {
      // @cpt-begin:cpt-frontx-algo-mfe-registry-domain-unregister-closes-admission:p1:inst-algo-du-close-first
      // Closed to new `registerExtension` calls (checked there, not here)
      // from this point on — before the drain loop below runs even its
      // first query — so the loop's "re-query until a pass finds nothing"
      // termination is sound: once closed, live membership can only shrink
      // from here, never grow, so the final empty pass really is final.
      this.domainsUnregistering.add(domainId);
      // @cpt-end:cpt-frontx-algo-mfe-registry-domain-unregister-closes-admission:p1:inst-algo-du-close-first
      try {
        // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-domain-unregister
        // The queue closes: the pending entry (if any) leaves it without
        // starting and each of its callers fails and takes its own
        // `fallback`; the running entry is not interrupted. A request
        // dispatched while the teardown below is in progress fails at once
        // without entering a slot — unregistration otherwise proceeds exactly
        // as it does for a domain whose queue is empty.
        this.occupancyCoordinatorsByDomain
          .get(domainId)
          ?.close('was unregistered while the request was queued.');
        // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-domain-unregister

        // @cpt-begin:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-release-domain
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-retract-advertisements
        // @cpt-begin:cpt-frontx-algo-mfe-registry-domain-unregister-closes-admission:p1:inst-algo-du-drain-bounded
        // Drain every extension this domain currently holds through this
        // registry's own `unregisterExtension`, the same path a standalone
        // extension unregistration takes — it releases the router admission
        // and retracts the propagated advertisement for each one. The
        // domain was closed to new registrations above, so re-querying live
        // membership after each pass (instead of snapshotting it once) is
        // guaranteed to terminate: no registration admitted after the close
        // above can ever appear in a later query.
        let liveExtensionIds = this.extensionManager
          .getExtensionStatesForDomain(domainId)
          .map((state) => state.extension.id);
        while (liveExtensionIds.length > 0) {
          for (const extensionId of liveExtensionIds) {
            await this.unregisterExtension(extensionId);
          }
          liveExtensionIds = this.extensionManager
            .getExtensionStatesForDomain(domainId)
            .map((state) => state.extension.id);
        }
        // @cpt-end:cpt-frontx-algo-mfe-registry-domain-unregister-closes-admission:p1:inst-algo-du-drain-bounded
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-retract-advertisements
        // @cpt-end:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-release-domain

        // Invariant: teardown hooks must still be able to dispatch. The manager
        // fires the domain's own `destroyed` stage — every member extension is
        // already drained above, so this call only runs that stage and removes
        // the domain's bookkeeping — whose chains target this domain, so the
        // handlers stay attached until it returns. Detaching after also drops
        // anything a teardown hook registered.
        await this.extensionManager.unregisterDomain(domainId);
        this.mediator.unregisterAllHandlers(domainId);
        this.occupancyCoordinatorsByDomain.delete(domainId);

        // @cpt-begin:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-release-domain
        this.releaseRouterDomain(domainId);
        // @cpt-end:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-release-domain

        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-retract-advertisements
        this.retractPropagatedTarget(domainId);
        this.advertisableTargets.delete(domainId);
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-retract-advertisements
      } finally {
        // @cpt-begin:cpt-frontx-algo-mfe-registry-domain-unregister-closes-admission:p1:inst-algo-du-reopen
        // @cpt-begin:cpt-frontx-algo-mfe-registry-domain-unregister-closes-admission:p1:inst-algo-du-reopen-on-failure
        // Cleared on every path, including a throw from any step above, so
        // a failed unregistration never leaves this domain id permanently
        // closed to a fresh `registerDomain`/`registerExtension` pair. A
        // domain that is still registered after a failed unregistration has
        // its occupancy queue reopened, so it stays usable.
        this.domainsUnregistering.delete(domainId);
        // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-domain-unregister
        if (this.extensionManager.getDomainState(domainId)) {
          this.occupancyCoordinatorsByDomain.get(domainId)?.reopen();
        }
        // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-queue-domain-unregister
        // @cpt-end:cpt-frontx-algo-mfe-registry-domain-unregister-closes-admission:p1:inst-algo-du-reopen-on-failure
        // @cpt-end:cpt-frontx-algo-mfe-registry-domain-unregister-closes-admission:p1:inst-algo-du-reopen
      }
    });
  }

  /**
   * Release notification helpers shared by `unregisterExtension`,
   * `unregisterDomain`, and `dispose` — sent only for an id the router
   * actually admitted, and never allowed to throw past this point: a
   * release is resource cleanup, never refused
   * (`inst-algo-ra-release-failure`). Resource cleanup, not an occupancy
   * action: these releases dispatch no `unmount_ext` and send no
   * settled-action report, so they give the router no occupancy action to
   * reflect into the URL (`inst-algo-ra-cleanup-no-report`).
   */
  // @cpt-begin:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-cleanup-no-report
  // @cpt-begin:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-release-failure
  private releaseRouterExtension(extensionId: string): void {
    if (!this.router || !this.routerAdmittedExtensionIds.delete(extensionId)) {
      return;
    }
    try {
      this.router.releaseExtension(extensionId);
    } catch (error) {
      console.error(`[DefaultMfeRegistry] releaseExtension failed for '${extensionId}':`, error);
    }
  }

  private releaseRouterDomain(domainId: string): void {
    if (!this.router || !this.routerAdmittedDomainIds.delete(domainId)) {
      return;
    }
    try {
      this.router.releaseDomain(domainId);
    } catch (error) {
      console.error(`[DefaultMfeRegistry] releaseDomain failed for '${domainId}':`, error);
    }
  }
  // @cpt-end:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-release-failure
  // @cpt-end:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-cleanup-no-report

  getExtension(extensionId: string): Extension | undefined {
    return this.extensionManager.getExtensionState(extensionId)?.extension;
  }

  getDomain(domainId: string): ExtensionDomain | undefined {
    return this.extensionManager.getDomainState(domainId)?.domain;
  }

  getExtensionsForDomain(domainId: string): Extension[] {
    const extensionStates = this.extensionManager.getExtensionStatesForDomain(domainId);
    return extensionStates.map(state => state.extension);
  }

  getRegisteredPackages(): string[] {
    return Array.from(this.packages.keys());
  }

  getExtensionsForPackage(packageId: string): Extension[] {
    const extensionIdSet = this.packages.get(packageId);
    if (!extensionIdSet) {
      return [];
    }

    const extensions: Extension[] = [];
    for (const extensionId of extensionIdSet) {
      const extension = this.getExtension(extensionId);
      if (extension) {
        extensions.push(extension);
      }
    }
    return extensions;
  }

  /**
   * Get domain state for a registered domain.
   * INTERNAL: Used by ActionsChainsMediator for domain resolution.
   */
  getDomainState(domainId: string): ExtensionDomainState | undefined {
    return this.extensionManager.getDomainState(domainId);
  }

  setTheme(cssVars: Record<string, string>): void {
    this.mountManager.setTheme(cssVars);
  }

  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-retract-own-advertisements
  dispose(): void {
    this.disposed = true;

    // Retract every advertisement this registry (and, transitively, its own
    // descendants — already re-propagated through it) previously propagated
    // upward through its inbound bridge, for the whole disposing subtree.
    for (const targetId of Array.from(this.propagatedTargetIds)) {
      this.retractPropagatedTarget(targetId);
    }

    // Drop every forwarding entry this registry holds — this registry is
    // going away regardless of whether its own inbound bridge link exists.
    // Acts on the routes only: a sub-chain the far side already accepted
    // through any of them keeps executing there.
    this.forwardingEntries.clear();
    this.advertisableTargets.clear();

    // Route link teardown through the single place link state changes, same
    // as every other unlink, rather than manually nulling the fields here.
    this.relinkInboundBridge(null);
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-retract-own-advertisements

    // @cpt-begin:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-release-on-dispose
    for (const extensionId of Array.from(this.routerAdmittedExtensionIds)) {
      this.releaseRouterExtension(extensionId);
    }
    for (const domainId of Array.from(this.routerAdmittedDomainIds)) {
      this.releaseRouterDomain(domainId);
    }
    // @cpt-end:cpt-frontx-algo-mfe-registry-router-admission:p1:inst-algo-ra-release-on-dispose

    // Releases every registered extension's retained bridge pair and
    // inbound link (`releaseExtensionBridge` -> `MountManager.releaseExtension`).
    this.extensionManager.clear();
    this.operationSerializer.clear();
    this.packages.clear();
    this.handlers.length = 0;

    // Pending callers settle and their timers clear at disposal.
    for (const coordinator of this.occupancyCoordinatorsByDomain.values()) {
      coordinator.close('was disposed with the registry while the request was queued.');
    }
    this.occupancyCoordinatorsByDomain.clear();

    void this.coordinator;
  }
}
