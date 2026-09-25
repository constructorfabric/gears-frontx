/**
 * MfeRegistry Configuration
 *
 * Configuration interface for creating a MfeRegistry instance.
 * The TypeSystemPlugin is required at initialization.
 *
 * @packageDocumentation
 */

import type { TypeSystemPlugin } from '../type-substrate';
import type { MfeHandler } from '../handler/types';
import type { RuntimeCoordinator } from './coordination/types';

/**
 * The one refusal a non-blocking lifecycle-stage trigger can encounter:
 * dispatching a hook's actions chain through the acceptance-only mediator
 * surface was synchronously refused (for example, an unwired dispatch
 * capability). Since no emitter observes a lifecycle-triggered chain's
 * outcome, this diagnostic is the sole attribution surface for that
 * refusal — reported, never fatal to the remaining hooks of the stage or
 * to the transition it accompanies
 * (`cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering`,
 * `inst-algo-lst-refusal-contained`).
 */
export interface LifecycleDispatchRefusalDiagnostic {
  /** Fixed classification for this diagnostic shape. */
  readonly classification: 'lifecycle-dispatch-refusal';
  /** Whether the entity the stage was triggered on is an extension or a domain. */
  readonly entityKind: 'extension' | 'domain';
  /** ID of the extension or domain the stage was triggered on. */
  readonly entityId: string;
  /** ID of the lifecycle stage being triggered. */
  readonly stageId: string;
  /** Zero-based declaration-order position of the refused hook among the stage's matching hooks. */
  readonly hookPosition: number;
  /** The refused chain's root action type. */
  readonly actionType: string;
  /** The refused chain's root action target. */
  readonly target: string;
  /** The refusal class the acceptance-only surface raised (e.g. `ActionsChainRefusalClass`, or a generic string for a non-refusal-typed synchronous throw). */
  readonly refusalClass: string;
  /** Opaque identity correlating this diagnostic to the triggering call, for cross-referencing multiple refusals from the same stage trigger. */
  readonly correlationId: string;
  /** Always `true`: a hook's refusal is contained and never halts the accompanying transition. */
  readonly transitionContinued: true;
}

/**
 * The other diagnostic shape a chain's own execution can produce: a node
 * failure, discovered only while an already-accepted chain is executing —
 * a missing handler, an admission failure, a delivery the far side of a hop
 * refused at the call, or an ordinary handler throw/timeout alike
 * (`cpt-frontx-algo-mfe-host-communication-mediator-dispatch`,
 * `inst-diagnostic-record`). Unlike a refusal, a node failure is never
 * reported to any emitter by design — settlement stays inside the executor
 * that accepted the chain — so this diagnostic is the ONLY attribution
 * surface for it. The discriminator (`classification`) deliberately mirrors
 * `LifecycleDispatchRefusalDiagnostic`'s so a substituted sink can
 * distinguish the two shapes with a single switch.
 */
export interface ChainNodeFailureDiagnostic {
  /** Fixed classification for this diagnostic shape. */
  readonly classification: 'chain-node-failure';
  /** The accumulated execution path (action type IDs) up to and including the failing node. */
  readonly path: readonly string[];
  /** The failing node's own target (domain or extension ID). */
  readonly target: string;
  /**
   * The failure class: e.g. `missing-handler`, `handler-failure`,
   * `unknown-failure`, and `hop-unavailable` — a reader must be able to
   * tell apart a refused delivery (no handler was reached at all, because
   * the far side of the hop refused it at the call) from a handler
   * failure. The class governs only how a failure is NAMED, never how it
   * is routed.
   */
  readonly failureClass: string;
  /**
   * For a refused delivery, WHICH of the ways the hop became unavailable
   * occurred (`bridge-deactivated`, `link-revoked`, `no-receiver-wired`,
   * `unrecognized-protocol-version`, `registry-disposed`,
   * `delivery-failed`). Absent for every failure that is not a cross-hop
   * one. `target` names the hop this cause occurred on.
   */
  readonly hopFailureCause?: string;
  /** Opaque identity correlating this diagnostic to the dispatch it came from — the same identity across every node and hop of that one dispatch. */
  readonly correlationId: string;
  /** Whether the entity that originated this dispatch (if it was lifecycle-triggered) is an extension or a domain. Absent when the dispatch was not lifecycle-triggered. */
  readonly originEntityKind?: 'extension' | 'domain';
  /** ID of the extension or domain that originated this dispatch, if it was lifecycle-triggered. */
  readonly originEntityId?: string;
  /** ID of the lifecycle stage that originated this dispatch, if it was lifecycle-triggered. */
  readonly originStageId?: string;
}

/**
 * Structured diagnostic sink for conditions the runtime cannot report
 * through any emitter-facing return value — a lifecycle hook's dispatch
 * refusal, and a chain-node failure alike, since acceptance-only dispatch
 * yields nothing an emitter could await or inspect for either. Substitutable
 * through registry configuration (this interface, wired via
 * `MfeRegistryConfig.diagnosticSink`) rather than only through internal
 * construction, so both hosts and tests can supply their own.
 */
export interface MfeDiagnosticSink {
  /**
   * Report a lifecycle hook's synchronous dispatch refusal. Never throws —
   * a diagnostic sink that itself failed would have nowhere further to
   * report the failure.
   */
  reportLifecycleDispatchRefusal(diagnostic: LifecycleDispatchRefusalDiagnostic): void;

  /**
   * Report a chain-node failure discovered while an already-accepted chain
   * was executing. Never throws, for the same reason as above.
   */
  reportChainNodeFailure(diagnostic: ChainNodeFailureDiagnostic): void;
}

/**
 * A committed change to one domain's mount set, as observed by a
 * `MountSetObserver`. Reports committed runtime state only — never a
 * chain's branch selection, settlement class, or completion
 * (`cpt-frontx-adr-action-dispatch-and-chaining`, MFES-8).
 */
export interface MountSetChange {
  /** ID of the domain whose mount set changed. */
  readonly domainId: string;
  /** Extension IDs that entered the mount set in this commit. */
  readonly entered: readonly string[];
  /** Extension IDs that left the mount set in this commit. */
  readonly left: readonly string[];
}

/**
 * Construction-time observer of committed mount-set changes, supplied
 * through `MfeRegistryConfig` alongside the injected `TypeSystemPlugin`.
 * Notified whenever the runtime commits a change to a domain's mount set —
 * from the commit itself, never from a lifecycle stage — carrying the
 * domain and what entered and left it. Supplying one adds no capability
 * method to `MfeRegistry` or to either bridge
 * (`cpt-frontx-constraint-mfes-cross-nesting-reachability`).
 */
export interface MountSetObserver {
  /** Notified once per committed mount-set change. Never throws. */
  onMountSetChanged(change: MountSetChange): void;
}

/**
 * Configuration for creating a MfeRegistry instance.
 *
 * The TypeSystemPlugin is REQUIRED at initialization - the registry cannot
 * function without it. All type validation, schema operations, and contract
 * matching depend on the plugin.
 */
export interface MfeRegistryConfig {
  /**
   * Type System plugin instance (REQUIRED).
   *
   * This plugin handles all type operations:
   * - Type ID validation and parsing
   * - Schema registration and retrieval
   * - Instance validation
   * - Type hierarchy checks
   *
   * @example
   * ```typescript
   * import { createMfeRegistryFactory } from '@gears-frontx/mfes';
   * import { gtsPlugin } from '@gears-frontx/gts-plugin';
   *
   * // Build the registry with GTS plugin at application wiring time
   * const registry = createMfeRegistryFactory().build({ typeSystem: gtsPlugin });
   *
   * // Use the registry with container provider
   * registry.registerDomain(myDomain, containerProvider);
   * ```
   */
  typeSystem: TypeSystemPlugin;

  /**
   * Optional runtime coordinator implementation.
   * If omitted, the registry uses `WeakMapRuntimeCoordinator`.
   *
   * This is primarily useful for tests and advanced host integrations that need
   * to control how runtime connections are stored and resolved.
   */
  coordinator?: RuntimeCoordinator;

  /**
   * Optional MFE handler instances.
   * If provided, these handlers will be registered with the registry.
   *
   * Note: The default MfeHandlerMF is NOT automatically registered.
   * Applications must explicitly provide handlers they want to use.
   */
  mfeHandlers?: MfeHandler[];

  /**
   * Optional structured diagnostic sink. If omitted, the registry uses a
   * `console.error`-based default. Substitutable so a host or a test can
   * attribute a lifecycle hook's dispatch refusal without the runtime
   * yielding anything an emitter could await for it.
   */
  diagnosticSink?: MfeDiagnosticSink;

  /**
   * Optional construction-time observer of committed mount-set changes.
   * Notified from the commit, never from a lifecycle stage; reports no
   * chain-settlement information.
   */
  mountSetObserver?: MountSetObserver;
}
