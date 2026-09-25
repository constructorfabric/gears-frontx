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

import type { TypeSystemPlugin } from '../type-substrate';
import { MfeRegistry } from '../registry/MfeRegistry';
import type { MfeRegistryConfig } from './config';
import type { ChildMfeBridge, MfeHandler, ParentMfeBridge } from '../handler/types';
import type { ExtensionDomain, Extension, ActionsChain } from '../types';
import type { ExtensionDomainImplementationFactory } from './ExtensionDomainImplementationFactory';
import type { ExtensionMounter } from './ExtensionMounter';
import { DefaultActionsChainsMediator } from '../mediator/actions-chains-mediator';
import { validateChainEnvelope } from '../mediator/chain-envelope-validator';
import { fromEnvelopeDiagnostics, reportSynchronousChainRefusal } from '../mediator/dispatch-diagnostics';
import {
  CROSS_HOP_PROTOCOL_VERSION,
  CrossHopUnavailableError,
  CrossHopRoute,
  type CrossHopEnvelope,
} from '../mediator/cross-hop-route';
import { RuntimeCoordinator } from './coordination/types';
import { InvalidatableDomainContext } from './DomainContext';
import { ConcurrentMountStrategy, OptionalMountStrategy, ExclusiveMountStrategy } from './mount-strategies';
import { WeakMapRuntimeCoordinator } from './coordination/weak-map-runtime-coordinator';
import { type ExtensionDomainState } from './extension-manager';
import { DefaultExtensionManager } from './default-extension-manager';
import { DefaultLifecycleManager } from './default-lifecycle-manager';
import { MountManager } from './mount-manager';
import { DefaultMountManager } from './default-mount-manager';
import { OperationSerializer } from './operation-serializer';
import { RuntimeBridgeFactory } from './runtime-bridge-factory';
import { DefaultRuntimeBridgeFactory } from './default-runtime-bridge-factory';
import { LoadExtHandler } from './extension-lifecycle-action-handler';
import { EntryTypeNotHandledError, ActionsChainRefusalError } from '../errors';
import { extractGtsPackage } from '../gts/extract-package';
import { DefaultExtensionMounter } from './DefaultExtensionMounter';
import { DefaultDomainLifecycleTrigger } from './DefaultDomainLifecycleTrigger';
import { ConsoleDiagnosticSink } from './default-diagnostic-sink';
import type { MfeDiagnosticSink, MountSetObserver } from './config';
import { ParentMfeBridgeImpl } from '../bridge/ParentMfeBridge';
import { BridgeInactiveError } from '../bridge/errors';
import {
  adoptAmbientInboundBridgeLink,
  tagArrivalEdge,
  unregisterInboundBridgeLink,
  type InboundBridgeLink,
} from './inbound-bridge-link';

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
   * descendant registry — synchronous and binary: throws to refuse, or
   * returns having handed the node over. */
  readonly sendDown: (envelope: CrossHopEnvelope) => void;
  /**
   * The opaque action-type id set this entry was admitted with — retained
   * (rather than discarded after the admission-time collision check) so
   * `repropagateThroughInboundBridge` can re-advertise this forwarding entry
   * upward, unchanged, after this registry's own inbound bridge is re-linked.
   */
  readonly actionTypeIds: readonly string[];
}

/** A `ChildMfeBridge` that also exposes the concrete-only `onCrossHopEnvelope` hook. */
interface CrossHopEnvelopeReceivingBridge extends ChildMfeBridge {
  onCrossHopEnvelope(handler: (envelope: CrossHopEnvelope) => void): () => void;
}

/**
 * Structural (duck-typed) check for `onCrossHopEnvelope`, deliberately NOT
 * `instanceof ChildMfeBridgeImpl`: the bridge adopted from the ambient
 * mounting-bridge rendezvous may have been constructed by a different,
 * independently loaded copy of this package than the one running this
 * check (`cpt-frontx-adr-mfe-load-isolation`), so the two sides cannot rely
 * on sharing a class definition — only on the bridge object's own shape.
 */
function hasOnCrossHopEnvelopeMethod(bridge: ChildMfeBridge): bridge is CrossHopEnvelopeReceivingBridge {
  return typeof (bridge as unknown as { onCrossHopEnvelope?: unknown }).onCrossHopEnvelope === 'function';
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
   * Actions chains mediator for action chain execution. Held as the CONCRETE
   * type — not the exported abstract `ActionsChainsMediator` — because this
   * registry's own internal cross-hop wiring
   * (`receiveCrossHopNode`/`acceptSingleNodeForHop`) needs the
   * completion-bearing "observed execution" operation the ADR deliberately
   * keeps off that exported abstraction. `DefaultMfeRegistry` already
   * constructs this concrete class directly and is the sole wiring site for
   * it, so holding the concrete type here adds no new exported contract.
   */
  private readonly mediator: DefaultActionsChainsMediator;

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
   * domains and extensions, keyed by target id with the opaque action-type id
   * set each was admitted with. Populated on admission regardless of whether
   * this registry currently holds an inbound bridge, and consulted by
   * `repropagateThroughInboundBridge` so a re-link (`relinkInboundBridge`)
   * re-advertises every target this registry still holds, not merely the ones
   * it happened to hold at the moment of its ORIGINAL link.
   */
  private readonly advertisableTargets = new Map<string, readonly string[]>();

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
   * Explicit disposed state (`cpt-frontx-adr-action-dispatch-and-chaining`):
   * `dispose()` releases every collaborator's state, but that alone degrades
   * a post-disposal `executeActionsChain` call to an ordinary no-handler
   * chain failure rather than reporting the actual condition — an unusable
   * dispatch capability. Checked first, synchronously, by `executeActionsChain`.
   */
  private disposed = false;

  /**
   * Structured diagnostic sink lifecycle-hook dispatch refusals are
   * reported through — the config-supplied one, or a `console.error`
   * default (`MfeRegistryConfig.diagnosticSink`).
   */
  private readonly diagnosticSink: MfeDiagnosticSink;

  /**
   * Construction-time observer of committed mount-set changes, if the host
   * supplied one (`MfeRegistryConfig.mountSetObserver`). `undefined` when
   * none was supplied — the per-domain mounter treats that as "no observer
   * to notify" rather than substituting a no-op.
   */
  private readonly mountSetObserver: MountSetObserver | undefined;

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
    this.diagnosticSink = config.diagnosticSink ?? new ConsoleDiagnosticSink();
    this.mountSetObserver = config.mountSetObserver;

    this.operationSerializer = new OperationSerializer();
    this.coordinator = new WeakMapRuntimeCoordinator();
    this.bridgeFactory = new DefaultRuntimeBridgeFactory();

    this.mediator = new DefaultActionsChainsMediator({
      typeSystem: this.typeSystem,
      getDomainState: (domainId) => this.extensionManager.getDomainState(domainId),
      getExtensionEntry: (extensionId) =>
        this.extensionManager.getExtensionState(extensionId)?.entry,
      resolveForwardingEntry: (targetId, arrivalEdge) =>
        this.resolveForwardingEntryRoute(targetId, arrivalEdge),
      resolveEscalation: () => this.resolveEscalationRoute(),
      // Same substitutable sink `DefaultLifecycleManager` reports a hook's
      // dispatch refusal through — one config-supplied (or defaulted)
      // instance shared by both, per `inst-diagnostic-record`.
      diagnosticSink: this.diagnosticSink,
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
    });

    // Wired to the ACCEPTANCE-ONLY public surface (`executeActionsChain`),
    // not the completion-bearing internal `executeAndAwaitChain`: a
    // lifecycle hook's chain must never be awaited by its trigger
    // (`cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering`), and
    // `executeActionsChain` is exactly "accept or synchronously refuse,
    // never yield anything awaitable for execution."
    this.lifecycleManager = new DefaultLifecycleManager(
      this.extensionManager,
      (chain) => this.executeActionsChain(chain),
      this.diagnosticSink
    );

    this.mountManager = new DefaultMountManager({
      extensionManager: this.extensionManager,
      resolveHandler: (entryTypeId) => this.resolveHandler(entryTypeId),
      coordinator: this.coordinator,
      typeSystem: this.typeSystem,
      triggerLifecycle: (extensionId, stageId) =>
        this.triggerLifecycleStageInternal(extensionId, stageId),
      // The public child capability accepts and refuses synchronously
      // (`dispatchActionsChain`, void) — nothing awaitable ever crosses
      // this bridge (`cpt-frontx-adr-mfe-runtime-public-surface`).
      dispatchActionsChain: (chain) => this.executeActionsChain(chain),
      hostRuntime: this,
      registerCatchAllRoute: (domainId, route) =>
        this.mediator.registerCatchAllRoute(domainId, route),
      unregisterCatchAllActionHandler: (domainId) =>
        this.mediator.unregisterCatchAllHandler(domainId),
      registerExtensionActionHandler: (extensionId, actionTypeId, handler, domainId) =>
        this.mediator.registerHandler(extensionId, actionTypeId, handler, domainId),
      unregisterExtensionActionHandler: (extensionId) =>
        this.mediator.unregisterAllHandlers(extensionId),
      bridgeFactory: this.bridgeFactory,
      buildInboundBridgeLink: (extensionId, childBridge, parentBridge) =>
        this.buildInboundBridgeLinkFor(extensionId, childBridge, parentBridge),
      retractInboundBridgeLink: (childBridge) =>
        this.retractInboundBridgeLinkFor(childBridge),
    });

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-adopt-ambient-bridge
    // Automatic ambient adoption: if a mount is synchronously in progress and
    // the extension being mounted is itself constructing this registry, adopt
    // that extension's bridge as this registry's inbound bridge — no config
    // field, no method call, no author action (`inst-inbound-bridge-auto-adopt`).
    // The published `relink` callback is what a LATER mount of the same host
    // extension uses to re-link this same registry instance, if the author
    // reuses rather than rebuilds it (`inst-publish-relink-callback`). If no
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
   * both by the constructor's initial ambient adoption and by a fresh
   * adoption's supersession of a previous adopter when a registry is rebuilt
   * inside a later mount of the same host extension. Idempotent: a no-op if
   * `link` is already this registry's current link.
   *
   * @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-relink-repropagate
   */
  private relinkInboundBridge(link: InboundBridgeLink | null): void {
    if (this.inboundBridgeLink === link) return; // idempotent

    this.inboundActionsChainUnsubscribe?.();
    this.inboundActionsChainUnsubscribe = null;
    this.propagatedTargetIds.clear();

    // The OLD link (if any) is simply replaced: retraction and deactivation
    // act on the route only, never on an execution already accepted through
    // it — there is nothing in flight on this (delivering) side to reject,
    // since a delivering runtime holds nothing for a node it handed over
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
    if (hasOnCrossHopEnvelopeMethod(link.edge)) {
      // Automatic downward delivery: a versioned cross-hop envelope
      // forwarded down to this registry through its inbound bridge lands
      // directly on this registry's own single-node executor, with no
      // explicit registration call required from the microfrontend author.
      // Re-established here on every re-link, discarding whatever the
      // previous link had accepted (`propagatedTargetIds` was already
      // cleared above). Synchronous: acceptance or refusal is decided
      // entirely inside `receiveCrossHopNode`, before this call returns.
      this.inboundActionsChainUnsubscribe = link.edge.onCrossHopEnvelope((envelope) =>
        this.receiveCrossHopNode(envelope)
      );
    }
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-relink-downward-delivery

    this.repropagateThroughInboundBridge();
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-relink-repropagate

  /**
   * Re-advertise, through this registry's (newly re-linked) inbound bridge,
   * every target this registry currently holds: each domain and extension
   * admitted to it directly, and every forwarding entry it holds on behalf
   * of its own descendants. Called only from `relinkInboundBridge`, after
   * the link is already in place, so `propagateAdvertisementUpward`'s own
   * idempotence guard (`propagatedTargetIds`) governs whether any given
   * target actually re-propagates further.
   */
  private repropagateThroughInboundBridge(): void {
    for (const [targetId, actionTypeIds] of this.advertisableTargets) {
      this.propagateAdvertisementUpward(targetId, actionTypeIds);
    }
    for (const [targetId, entry] of this.forwardingEntries) {
      this.propagateAdvertisementUpward(targetId, entry.actionTypeIds);
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
   * `handler/types.ts` rather than here.
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
      propagateAdvertisement: (targetId, actionTypeIds) =>
        revoked ? false : this.admitAdvertisement(targetId, actionTypeIds, childBridge, sendDown),
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
          throw new CrossHopUnavailableError(
            extensionId,
            'link-revoked',
            `Inbound bridge link for '${extensionId}' has been revoked.`
          );
        }
        if (!isActiveBridge(childBridge)) {
          throw new BridgeInactiveError(extensionId);
        }
        tagArrivalEdge(envelope.node.action, childBridge);
        // Synchronous and binary: `receiveCrossHopNode` throws on refusal
        // (unrecognized protocol version, disposed registry) or returns
        // having accepted and reserved what the node needs — either way
        // this call is done the instant it returns.
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
    actionTypeIds: readonly string[],
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
    this.forwardingEntries.set(targetId, { edge, sendDown, actionTypeIds });
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-record-forwarding-entry

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-repropagate-upward
    this.propagateAdvertisementUpward(targetId, actionTypeIds);
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-repropagate-upward
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-no-collision
    return true;
  }

  /**
   * Compose and propagate an advertisement for a locally-admitted target
   * upward through this registry's inbound bridge, if it has one.
   */
  private propagateAdvertisementUpward(targetId: string, actionTypeIds: readonly string[]): void {
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
      // Idempotence guard: already propagated (e.g. a post-relink explicit
      // re-registration by the author) — do not double-advertise.
      return;
    }
    const accepted = this.inboundBridgeLink.propagateAdvertisement(targetId, actionTypeIds);
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
   * through this entry keeps executing there, untouched by this call —
   * there is nothing in flight on THIS (delivering) side to reject, since a
   * delivering runtime holds nothing for a node it handed over
   * (`inst-retract-advertisements`).
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
   * disposes itself. This is what fixes both (i) a fresh-registry-per-mount
   * pattern getting its readvertisement rejected by a stale collision-guard
   * entry from a prior mount, and (ii) a persistent-registry pattern left
   * pointing at a bridge this registry has already torn down: after this
   * runs, the parent's own forwarding-entry state for that bridge is fully
   * clean, so a subsequent remount re-advertises without collision, and a
   * reused (not rebuilt) child registry's own further attempts to propagate
   * or retract through its now-revoked link simply fail to find an entry to
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
   * Mediator-injected tier-4 resolution: a downward forwarding entry for
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
   * Mediator-injected tier-5 resolution: the escalation route bound to this
   * registry's inbound bridge. `undefined` when this registry holds no
   * inbound bridge (it is the shell). Arrival-edge tagging is NOT done here
   * — it happens inside `link.escalate` itself, minted by the PARENT
   * registry at link time (`buildInboundBridgeLinkFor`), so that the tag is
   * written and later read by the same (parent) copy of this package
   * regardless of which copy this (child) registry belongs to.
   *
   * Deliberately target-blind by design: by the time the mediator's
   * escalation tier runs, tiers 1-4 have already exhausted every way THIS
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
   * Resolves the extension's domain, then dispatches through the per-domain
   * `DefaultExtensionMounter` so mount-set bookkeeping (`removeMountedExtension`)
   * and container DOM teardown run alongside `MountManager.unmountExtension`.
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
      await mounter.unmount(extensionId);
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
    // Step 1: GTS-validate and store initial domain state (no init trigger yet).
    this.extensionManager.registerDomain(declaration);

    // Step 2: Construct per-domain mounter and lifecycle trigger.
    const mounter = new DefaultExtensionMounter(
      declaration.id,
      this.mountManager,
      (domainId, extId) => this.extensionManager.addMountedExtension(domainId, extId),
      (domainId, extId) => this.extensionManager.removeMountedExtension(domainId, extId),
      (domainId) => this.extensionManager.getMountedExtensions(domainId),
      // Hooks passed to detach — strategies create their own hooks; the mounter uses them
      // only for mass-unmount in detach(), so we supply a no-op here and let each
      // strategy handle its own hooks during normal unmount. Detach delegates to
      // mountManager.unmountExtension directly without hooks.destroy since by detach
      // time the strategy has already been invalidated.
      {
        create: (_extId: string) => { throw new Error('DefaultExtensionMounter: create called on detach hooks'); },
        destroy: (_extId: string) => { /* no-op: strategy handles destroy during normal unmount */ },
      },
      // Construction-time mount-set observer, if the host supplied one —
      // notified from the commit (this mounter's own bookkeeping calls
      // above), never from a lifecycle stage (MFES-8, `cpt-frontx-adr-action-dispatch-and-chaining`).
      this.mountSetObserver
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
    try {
      this.crossValidateHandlers(declaration, implementation._getMountStrategiesInternal(), ctx);
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

    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-domain-registered
    // @cpt-begin:cpt-frontx-state-extension-domain-governance-cardinality:p2:inst-card-t3
    // Step 6: Persist handlers to mediator.
    for (const [actionType, handler] of ctx.getCollectedHandlers()) {
      this.mediator.registerHandler(declaration.id, actionType, handler);
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
    this.advertisableTargets.set(declaration.id, declaration.actions);
    this.propagateAdvertisementUpward(declaration.id, declaration.actions);
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-compose-advertisement

    // Step 8: Non-blocking 'init' lifecycle stage trigger. The stage ID
    // comes from the injected plugin: MFES-1 forbids this package from
    // spelling a concrete type-format literal, and a consumer whose stages
    // live in another notation would otherwise never be matched. Void —
    // `triggerDomainOwnLifecycleStageInternal` dispatches and returns
    // without waiting for any hook's chain to settle; a hook's own
    // synchronous refusal is already caught and reported by
    // `DefaultLifecycleManager` and never propagates here.
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
    strategies: import('./mount-strategy').MountStrategy[],
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
    // Non-string entries are treated as non-matching (F-009 hardening) rather than
    // letting typeSystem.isTypeOf throw on a malformed declaredActions entry.
    const hasMountExtOrDerivative = declaredActions.some(
      (id) => typeof id === 'string' && this.typeSystem.isTypeOf(id, mountExtActionId)
    );
    const hasUnmountExtOrDerivative = declaredActions.some(
      (id) => typeof id === 'string' && this.typeSystem.isTypeOf(id, unmountExtActionId)
    );
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-missing-required
    if (requireMount && !hasMountExtOrDerivative) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-required-fail
      throw new Error(
        `Domain '${declaration.id}': ${strategyName} requires '${mountExtActionId}' in declaration.actions.`
      );
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-required-fail
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-missing-required
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-missing-required
    if (requireUnmount && !hasUnmountExtOrDerivative) {
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
    if (forbidUnmount && hasUnmountExtOrDerivative) {
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-forbidden-present
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-strategy-cardinality:p1:inst-sc-forbidden-fail
      // Name the actual declared action that triggered the violation (may be a
      // hierarchy-derived id, not necessarily the plugin-resolved base id) for debuggability.
      const offendingAction = declaredActions.find(
        (id) => typeof id === 'string' && this.typeSystem.isTypeOf(id, unmountExtActionId)
      );
      throw new Error(
        `Domain '${declaration.id}': ${strategyName} forbids '${unmountExtActionId}' in declaration.actions, ` +
        `but declared action '${String(offendingAction)}' violates this rule.`
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
  // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-invoke-execute
  // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-validate-dispatch
  // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-accept-and-reserve
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-validate-emitter-capability
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-refusal-check
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-refuse-sync
  /**
   * Accept (or synchronously refuse) an actions chain for execution.
   *
   * Acceptance-only per `cpt-frontx-adr-mfe-runtime-public-surface` and
   * `cpt-frontx-adr-action-dispatch-and-chaining`: this call either accepts
   * the chain — validating its envelope and this registry's own dispatch
   * capability (not disposed) — or throws `ActionsChainRefusalError`
   * synchronously. It never returns a value and never yields a promise a
   * caller could await for the chain's own execution
   * (`inst-accept-yields-nothing`); the completion-bearing observed
   * execution this drives runs entirely on the executor's own, via the
   * internal `executeAndAwaitChain`.
   *
   * @throws {ActionsChainRefusalError} synchronously on a malformed chain,
   *   an invalid declared per-action timeout, or a disposed registry —
   *   each a capability unusable at the moment of the call, never a chain
   *   failure.
   */
  executeActionsChain(chain: ActionsChain): void {
    // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-refusal-branch
    if (this.disposed) {
      // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-refuse-at-call
      const refusal = new ActionsChainRefusalError(
        'disposed_registry',
        [],
        'MfeRegistry: dispatch refused — this registry has been disposed'
      );
      // Every refusal is attributed through the substitutable sink
      // (`inst-diagnostic-record`: "for a refusal and for every node failure
      // alike"), reported BEFORE the throw below — the throw itself, the
      // contract with this call's caller, is unchanged.
      reportSynchronousChainRefusal(this.diagnosticSink, chain, refusal);
      throw refusal;
      // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-refuse-at-call
    }
    // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-refusal-branch
    try {
      validateChainEnvelope(chain);
    } catch (error) {
      reportSynchronousChainRefusal(this.diagnosticSink, chain, error);
      throw error;
    }

    // Fire-and-forget: settlement is observed entirely by the executor's
    // own internals (`executeAndAwaitChain`), never by this caller. Calling
    // an async function never throws synchronously — any synchronous
    // exception inside it becomes a rejected promise, caught below — so no
    // internal, post-acceptance failure can leak out of this call as if it
    // were a refusal. This call is also what creates the chain's executor
    // state and reserves what its first executable node needs (both
    // inside `this.mediator.runAcceptedChain`/`executeChainRecursive`,
    // synchronously, before this method returns) and returns nothing to
    // the developer.
    void this.executeAndAwaitChain(chain).catch((error) => {
      console.error('[MfeRegistry] Unhandled error in accepted chain execution', error);
    });
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-refuse-sync
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-refusal-check
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-validate-emitter-capability
  // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-accept-and-reserve
  // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-validate-dispatch
  // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-invoke-execute

  /**
   * Internal, completion-bearing chain execution: validates the envelope
   * and awaits the mediator's own "observed execution" directly (via the
   * CONCRETE mediator this registry holds), logging a diagnostic when the
   * chain does not complete. NOT part of the public `MfeRegistry` facade —
   * `cpt-frontx-adr-mfe-runtime-public-surface` keeps the completion-bearing
   * operation off the public surface entirely.
   *
   * The ONLY caller is `executeActionsChain`'s own fire-and-forget
   * dispatch: nothing awaitable this method yields ever crosses a bridge
   * or is passed into bridge wiring — completion observation stays
   * strictly inside this executor. Lifecycle hooks (`DefaultLifecycleManager`)
   * are not among its callers either — a triggered stage's chain is
   * dispatched through the acceptance-only public facade
   * (`executeActionsChain`, wired as `dispatchActionsChain`), never awaited
   * by this registry.
   *
   * @internal
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-accept-yields-nothing
  private async executeAndAwaitChain(chain: ActionsChain): Promise<void> {
    try {
      validateChainEnvelope(chain);
    } catch (error) {
      // `executeActionsChain` already validated and reported before
      // calling this method, so a refusal reaching this call never
      // re-reports: the same pure validation simply passes again.
      reportSynchronousChainRefusal(this.diagnosticSink, chain, error);
      throw error;
    }
    // This registry-level console log is `DefaultMfeRegistry`'s own, coarse
    // "did the chain fail" log for callers of the public facade. It is
    // independent of, and does not duplicate, the mediator's own
    // fine-grained per-node `diagnosticSink.reportChainNodeFailure` call:
    // that one is reported from inside `this.mediator` itself, at the point
    // of first catch.
    //
    // A successful hand-over across a hop settles THIS runtime's own run as
    // `completed: false` too — this runtime executed nothing for the node,
    // the far side did — so `handedOver` distinguishes that case: it is not
    // a chain failure, and logging it as one would be a false failure for
    // every chain that crosses a hop (`ChainSettlement.handedOver`'s own
    // doc). Likewise, a run ended by this executor's own teardown
    // (`ChainSettlement.tornDown`) is a lifetime boundary, never an outcome
    // of the action — logging it here would misreport disposal itself as a
    // chain failure. Only a run that is neither completed, handed over, nor
    // torn down is an actual chain failure.
    const settlement = await this.mediator.runAcceptedChain(chain);
    if (!settlement.completed && !settlement.handedOver && !settlement.tornDown) {
      console.error(
        `[MfeRegistry] Actions chain failed`,
        `| path: [${settlement.path.join(' -> ')}]`
      );
    }
    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-admitted-mount
    // (mount strategy invoked via mediator dispatch chain → strategy.mount())
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-admitted-mount
    // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-mount-success
    // (implicit: chain.completed = true on success path)
    // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-mount-success
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-accept-yields-nothing
  // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-mount-action

  /**
   * Receiving side of every cross-hop delivery into THIS registry's own
   * mediator — a downward forwarding entry, an upward escalation, or the
   * converted parent-to-child-domain forwarding tier, all landing here via
   * `onCrossHopEnvelope`/`InboundBridgeLink.escalate`. Unlike the PUBLIC
   * `executeActionsChain` (acceptance-only, synchronously refusing when
   * unusable), this executes exactly the ONE node the envelope carries.
   *
   * Synchronous and binary, by construction: refuse at the call — before
   * taking anything, so the refusal has no side effect here — or accept,
   * transferring the sub-chain so every later failure of that node is this
   * registry's own, answered by the `fallback` it dispatches from itself,
   * never surfacing back through this call (`inst-receive-refusal-check`,
   * `inst-receive-refuse`).
   *
   * @throws {CrossHopUnavailableError} synchronously, before anything is
   *   taken, when the envelope carries an internal transport protocol
   *   version this copy does not recognize (with a diagnostic naming the
   *   version met and the version this copy implements) or this registry
   *   has been disposed.
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-receive-hand-over
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-receive-refusal-check
  private receiveCrossHopNode(envelope: CrossHopEnvelope): void {
    if (envelope.version !== CROSS_HOP_PROTOCOL_VERSION) {
      console.error(
        '[DefaultMfeRegistry] Cross-hop envelope carries an unrecognized protocol version ' +
        `(met ${envelope.version}, this copy implements ${CROSS_HOP_PROTOCOL_VERSION}). ` +
        'Treating this hop as unavailable rather than acting on semantics it cannot establish.'
      );
      // Typed so the DISPATCHING side — a different, possibly
      // independently loaded copy of this package — classifies this as the
      // hop's own unavailability rather than as a handler failure
      // (`inst-diagnostic-record`). Recognised structurally there, never by
      // `instanceof`, precisely because the two copies share no class.
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-receive-refuse
      throw new CrossHopUnavailableError(
        typeof envelope?.node?.action?.target === 'string' ? envelope.node.action.target : '<unknown>',
        'unrecognized-protocol-version',
        `Unrecognized cross-hop protocol version: met ${envelope.version}, expected ${CROSS_HOP_PROTOCOL_VERSION}`
      );
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-receive-refuse
    }
    if (this.disposed) {
      throw new CrossHopUnavailableError(
        typeof envelope?.node?.action?.target === 'string' ? envelope.node.action.target : '<unknown>',
        'registry-disposed',
        'Cross-hop delivery refused: this registry has been disposed.'
      );
    }
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-receive-refusal-check
    // Reconstruct THIS dispatch's own correlation identity (and, where it
    // has one, its origin) from the envelope's `diagnostics` field, so a
    // node failure at THIS end of the hop still attributes to the SAME
    // dispatch that crossed into it (`inst-diagnostic-record`) — never a
    // fresh, disconnected identity minted here. Acceptance validates the
    // action and mints the execution state, and — WITHOUT resolving the
    // node itself, which happens only inside the scheduled microtask below
    // — conditionally RESERVES what the node needs where this registry
    // will itself execute it, all before it returns; the node's actual
    // invocation is scheduled strictly after, so no handler code runs on
    // this call stack.
    this.mediator.acceptSingleNodeForHop(envelope.node, fromEnvelopeDiagnostics(envelope.diagnostics));
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
      // @cpt-begin:cpt-frontx-flow-mfe-registry-register-validate-mount:p1:inst-flow-rvm-05
      // Developer-invoked registration of an Extension value: delegates entry
      // type-validation, handler resolution, and entry storage to the manager.
      await this.extensionManager.registerExtension(extension);
      // @cpt-end:cpt-frontx-flow-mfe-registry-register-validate-mount:p1:inst-flow-rvm-05

      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-compose-advertisement
      // Admission complete: record this extension as one of this registry's
      // own advertisable targets, then propagate its advertisement upward,
      // using its declared receivable-action set as the opaque action-type id set.
      const admittedEntry = this.extensionManager.getExtensionState(extension.id)?.entry;
      if (admittedEntry) {
        this.advertisableTargets.set(extension.id, admittedEntry.actions);
        this.propagateAdvertisementUpward(extension.id, admittedEntry.actions);
      }
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
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-retract-advertisements
      // Extensions each propagate their own advertisement on admission
      // (`registerExtension`'s `inst-compose-advertisement`), independent of
      // mount state — so every extension currently registered under this
      // domain (not just the mounted ones) holds a stale advertisement in
      // every ancestor once the domain is gone. Capture the full registered
      // set before the manager's cascade below removes them, since
      // `DefaultExtensionManager.unregisterDomain` cascades through its own
      // internal `unregisterExtension` (not `DefaultMfeRegistry.unregisterExtension`,
      // the method that normally calls `retractPropagatedTarget`), so those
      // cascaded removals never retract the propagated advertisement on their own.
      const extensionIdsToRetract = this.extensionManager
        .getExtensionStatesForDomain(domainId)
        .map((state) => state.extension.id);
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-retract-advertisements

      // Invariant: teardown hooks must still be able to dispatch. The manager
      // unmounts the extensions and fires the domain's `destroyed` stage, whose
      // chains target this domain — so the handlers stay attached until it
      // returns. Detaching after also drops anything a teardown hook registered.
      await this.extensionManager.unregisterDomain(domainId);
      this.mediator.unregisterAllHandlers(domainId);

      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-retract-advertisements
      for (const extensionId of extensionIdsToRetract) {
        this.retractPropagatedTarget(extensionId);
        this.advertisableTargets.delete(extensionId);
      }
      this.retractPropagatedTarget(domainId);
      this.advertisableTargets.delete(domainId);
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-retract-advertisements
    });
  }

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
    // Marked FIRST: disposal is an absent capability, not a routing outcome
    // (`cpt-frontx-adr-action-dispatch-and-chaining`) — a dispatch that
    // arrives concurrently with this teardown must see the registry as
    // already disposed, refusing synchronously, rather than racing into
    // in-flight state this method is about to clear.
    this.disposed = true;

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-executor-teardown-ends
    // Signal the executor-lifetime boundary to the mediator itself, so this
    // registry's teardown governs every execution its executor still holds
    // — a node whose attempt settles after this call selects neither `next`
    // nor `fallback` and is recorded as no chain failure
    // (`cpt-frontx-adr-action-dispatch-and-chaining`). Called from here,
    // never lazily inferred from `this.disposed` elsewhere, so the
    // boundary is the SAME instant this registry itself becomes disposed.
    this.mediator.dispose();
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-executor-teardown-ends

    // Retract every advertisement this registry (and, transitively, its own
    // descendants — already re-propagated through it) previously propagated
    // upward through its inbound bridge, for the whole disposing subtree.
    for (const targetId of Array.from(this.propagatedTargetIds)) {
      this.retractPropagatedTarget(targetId);
    }

    // Drop every forwarding entry this registry holds — this registry is
    // going away regardless of whether its own inbound bridge link exists.
    // Acts on the routes only: a sub-chain the far side already accepted
    // through any of them keeps executing there, untouched by disposal,
    // since this delivering side holds nothing for a node it handed over.
    this.forwardingEntries.clear();
    this.advertisableTargets.clear();

    // Route link teardown through the single place link state changes, same
    // as every other unlink, rather than manually nulling the fields here.
    this.relinkInboundBridge(null);
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-registration-propagation:p2:inst-retract-own-advertisements

    // Releases every registered extension's retained bridge pair and
    // inbound link (`releaseExtensionBridge` -> `MountManager.releaseExtension`).
    this.extensionManager.clear();
    this.operationSerializer.clear();
    this.packages.clear();
    this.handlers.length = 0;

    void this.coordinator;
  }
}
