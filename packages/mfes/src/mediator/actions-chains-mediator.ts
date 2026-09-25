// @cpt-flow:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1
// @cpt-algo:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p2
// @cpt-state:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2
// @cpt-flow:cpt-frontx-flow-extension-domain-governance-admission:p1
/**
 * Default Actions Chains Mediator Implementation
 *
 * Concrete implementation of ActionsChainsMediator.
 * This is an INTERNAL implementation detail and is NOT exported from the package.
 *
 * @packageDocumentation
 */

import { isInfrastructureLifecycleAction, type TypeSystemPlugin } from '../type-substrate';
import type { Action, ActionsChain, ExtensionDomain, MfeEntry } from '../types';
import type { ExtensionDomainState } from '../runtime/extension-manager';
import { getArrivalEdge } from '../runtime/inbound-bridge-link';
import type { MfeDiagnosticSink } from '../runtime/config';
import { ConsoleDiagnosticSink } from '../runtime/default-diagnostic-sink';
import { isValidDeclaredTimeout, validateChainEnvelope } from './chain-envelope-validator';
import {
  CROSS_HOP_FAILURE_CLASS_UNAVAILABLE,
  CROSS_HOP_PROTOCOL_VERSION,
  CrossHopRoute,
  CrossHopUnavailableError,
  isCrossHopUnavailableError,
  type CrossHopEnvelope,
  type CrossHopUnavailabilityCause,
} from './cross-hop-route';
import {
  getDispatchOrigin,
  invokeDiagnosticSinkSafely,
  nextDispatchCorrelationId,
  reportSynchronousChainRefusal,
  toEnvelopeDiagnostics,
  type DiagnosticContext,
} from './dispatch-diagnostics';
import { ActionsChainsMediator, ActionHandler } from './types';

/** Narrows a resolved handler to the cross-hop (forwarding-entry/escalation) shape. */
function isCrossHopRoute(resolved: ActionHandler | CrossHopRoute): resolved is CrossHopRoute {
  return resolved instanceof CrossHopRoute;
}

/**
 * Executor-internal settlement record for one accepted chain's execution —
 * the "observed execution" half of the acceptance/execution split
 * (`cpt-frontx-adr-action-dispatch-and-chaining`). Deliberately not exported
 * from the package's public barrel (`cpt-frontx-adr-mfe-runtime-public-surface`):
 * this is the shape the executor's own recursion observes for ITS OWN
 * dispatch alone — `DefaultMfeRegistry.executeAndAwaitChain` awaits it
 * purely to log a coarse failure for that one dispatch — and it is never
 * handed to an emitter and never consumed by cross-hop wiring, which
 * carries no settlement back across a hop at all.
 *
 * @internal
 */
export interface ChainSettlement {
  /** Whether the chain (or, for a single-node cross-hop execution, the node) completed. */
  completed: boolean;
  /** Accumulated execution path of action type IDs. */
  path: string[];
  /**
   * Set when this runtime's own execution ended by handing the node onward
   * across a hop that the far side accepted, rather than by that node
   * itself completing or failing. This is NOT an action outcome — the
   * delivering runtime executed nothing for this node — so it is reported
   * alongside `completed: false` without being a failure: the node's
   * branch selection now belongs to the receiving registry
   * (`inst-flow-accepted-continues`, `inst-hand-over-done`). Absent (or
   * `false`) for every other settlement, hand-over refusal included, which
   * settles as an ordinary node failure through `fallback`.
   */
  handedOver?: boolean;
  /**
   * Set when this settlement's own `completed: false` is the executor's
   * teardown lifetime boundary (`inst-executor-teardown-ends`) rather than
   * an outcome of the action: the attempt this node held was ended by
   * `dispose()`, never by the node itself succeeding, failing, or timing
   * out. Distinguished from an ordinary node failure the same way
   * `handedOver` distinguishes a hand-over — so a caller answering only
   * genuine chain failures (`DefaultMfeRegistry.executeAndAwaitChain`'s own
   * coarse log) never mistakes a teardown for one. Absent (or `false`) for
   * every other settlement, teardown included ONLY where it is this
   * settlement's own reason for `completed: false`.
   */
  tornDown?: boolean;
}

/**
 * Thrown by the mediator's primary-step execution when neither a
 * `(target, actionType)` handler nor a catch-all handler is registered
 * for the resolved target. Caught by `executeChainRecursive`'s own
 * try/catch — the failing node's own failure boundary — which selects
 * `chain.fallback` if declared; with no fallback declared, the chain ends
 * at this node and that same call frame returns `completed: false`
 * directly, never rethrowing past its own boundary — the mediator never
 * throws to an emitter, nor to an ancestor node that already dispatched
 * this continuation.
 *
 * Error message format matches the spec contract verbatim:
 * `No handler found for target '{target}' and action type '{actionType}'`.
 *
 * @internal
 */
export class NoHandlerForActionTargetError extends Error {
  constructor(
    public readonly target: string,
    public readonly actionType: string
  ) {
    super(
      `No handler found for target '${target}' and action type '${actionType}'`
    );
    this.name = 'NoHandlerForActionTargetError';
  }
}

/**
 * Thrown inside a node's own failure boundary when the resolved per-action
 * timeout — an authoritative domain's `defaultActionTimeout`, resolved
 * absent a declared `action.timeout` — is not itself in the one valid form
 * ADR `cpt-frontx-adr-action-dispatch-and-chaining` holds a domain default
 * to (positive, finite, integer, schedulable). Deliberately a NODE failure
 * rather than a refusal: the invalidity is discovered only once execution
 * reaches the node whose target that domain is authoritative for, and an
 * emitter dispatching a chain that never reaches this target would have no
 * way to know the domain's own configuration is broken — the chain's
 * declared `fallback` is the addressee, exactly as for any other
 * discoverable-only-during-execution condition.
 *
 * @internal
 */
export class InvalidDomainDefaultTimeoutError extends Error {
  constructor(domainId: string, value: unknown) {
    super(
      `Domain '${domainId}' declares an invalid defaultActionTimeout (${String(value)}): ` +
        'must be a positive, finite integer count of milliseconds a platform timer schedules as written'
    );
    this.name = 'InvalidDomainDefaultTimeoutError';
  }
}

/**
 * Classifies a caught node failure into the `failureClass` string a
 * `ChainNodeFailureDiagnostic` carries (`inst-diagnostic-record`).
 *
 * A hop's UNAVAILABILITY — refused at the call: an inactive or disposed
 * bridge, a revoked link, no receiver wired, an unrecognized transport
 * protocol version, or a disposed receiving registry — is a class of its
 * own and never `handler-failure`: no handler was reached at all, so naming
 * it a handler failure would send a reader looking for a defect in code
 * that was never invoked. A handler failure proper — a handler ran and did
 * not succeed, including its own bound elapsing — keeps `handler-failure`,
 * unchanged.
 *
 * Recognition of the cross-hop class is STRUCTURAL
 * (`isCrossHopUnavailableError`) rather than `instanceof`, because that
 * error may have been minted by a different, independently loaded copy of
 * this package on the far side of a hop.
 */
// @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-diagnostic-record
function classifyChainNodeFailure(error: unknown): string {
  if (error instanceof NoHandlerForActionTargetError) return 'missing-handler';
  if (isCrossHopUnavailableError(error)) return CROSS_HOP_FAILURE_CLASS_UNAVAILABLE;
  if (error instanceof InvalidDomainDefaultTimeoutError) return 'invalid-domain-default-timeout';
  if (error instanceof Error) return 'handler-failure';
  return 'unknown-failure';
}

/**
 * The `hopFailureCause` a diagnostic carries alongside the hop it names —
 * WHICH of the ways a hop became unavailable occurred
 * (`inst-diagnostic-record`). Absent for every failure that is not a
 * cross-hop one.
 */
function hopFailureCauseOf(error: unknown): string | undefined {
  return isCrossHopUnavailableError(error) ? error.unavailabilityCause : undefined;
}
// @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-diagnostic-record

/**
 * Normalise a refused delivery into the hop's own unavailability class,
 * naming this executor's own hop (the node's target) rather than whatever
 * identifier the far side happened to use.
 *
 * Every refusal belongs to this class, and that is the ADR's own rule
 * rather than a convenience: a refusal means the hop never took the node,
 * so no handler ran, so nothing that happened can be a handler failure.
 * Recognised causes keep their own name; a bridge that refused delivery
 * because it is inactive or disposed, or found no receiver wired, is
 * recognised by its `code` (structurally — the bridge errors may come from
 * another copy of this package); anything else is `delivery-failed`.
 */
function toHopUnavailability(hop: string, error: unknown): CrossHopUnavailableError {
  if (isCrossHopUnavailableError(error)) {
    return error.hop === hop
      ? error
      : new CrossHopUnavailableError(hop, error.unavailabilityCause, error.message);
  }
  const code = (error as { code?: unknown } | null | undefined)?.code;
  const cause: CrossHopUnavailabilityCause =
    code === 'BRIDGE_INACTIVE' || code === 'BRIDGE_DISPOSED'
      ? 'bridge-deactivated'
      : code === 'NO_ACTIONS_CHAIN_HANDLER'
        ? 'no-receiver-wired'
        : 'delivery-failed';
  const detail = error instanceof Error ? error.message : String(error);
  return new CrossHopUnavailableError(
    hop,
    cause,
    `Cross-hop route to target '${hop}' is unavailable: the hop refused the delivery at the call (${detail})`
  );
}

/**
 * Concrete implementation of ActionsChainsMediator.
 *
 * Handles action chain execution with success/failure branching, timeout management,
 * and per-(targetId, actionTypeId) handler registration.
 *
 * This is the default mediator implementation used by MfeRegistry.
 * It is NOT exported from the package - only the abstract ActionsChainsMediator is exported.
 *
 * @internal
 */
export class DefaultActionsChainsMediator extends ActionsChainsMediator {
  /**
   * The Type System plugin instance.
   */
  public readonly typeSystem: TypeSystemPlugin;

  /**
   * Callback to get domain state for target resolution.
   * Injected during construction to avoid dependency on full MfeRegistry.
   */
  private readonly getDomainState: (domainId: string) => ExtensionDomainState | undefined;

  /**
   * Callback to look up the MfeEntry of a registered extension by its ID.
   * Injected during construction; used by runtime action declaration validation
   * to verify that a dispatched action.type is declared in the target entry's
   * `actions` (the action types the entry can receive and execute).
   */
  private readonly getExtensionEntry: (extensionId: string) => MfeEntry | undefined;

  /**
   * Injected callback resolving a downward forwarding entry for a target
   * previously advertised by a descendant registry through registration
   * propagation, excluding any entry whose bridge equals the chain's tagged
   * arrival edge (loop containment). Returns `undefined` if no forwarding
   * entry exists for the target, or `undefined` when a registry has no such
   * entries at all (root registries with nothing propagated to them).
   *
   * Realizes `inst-forwarding-entry-lookup`.
   */
  private readonly resolveForwardingEntry?: (
    targetId: string,
    arrivalEdge: unknown
  ) => CrossHopRoute | undefined;

  /**
   * Injected callback resolving the escalation route bound to this
   * registry's inbound bridge. Returns `undefined` when the registry holds
   * no inbound bridge (i.e. it is the shell/root).
   *
   * Realizes `inst-escalation-lookup`.
   */
  private readonly resolveEscalation?: () => CrossHopRoute | undefined;

  /**
   * Unified handler map: targetId → (actionTypeId → handler).
   * Used for both domain-side and extension-side handlers.
   */
  private readonly actionHandlers = new Map<string, Map<string, ActionHandler>>();

  /**
   * Maps extension target IDs to their domain IDs.
   * Populated when registerHandler() is called with a domainId.
   * Used by resolveDomain() to find the domain for extension-targeted actions
   * when resolving defaultActionTimeout.
   */
  private readonly targetDomainMap = new Map<string, string>();

  /**
   * Catch-all tier consulted for a target regardless of action type, used by
   * child domain forwarding. The catch-all tier itself resolves to a
   * `CrossHopRoute` — never a plain `ActionHandler` — wherever the target it
   * matches sits across a runtime boundary
   * (`cpt-frontx-adr-action-dispatch-and-chaining`): a handler is invoked by
   * the dispatching mediator after IT has already admitted the action, so a
   * hop wearing a handler's shape would admit at the forwarding registry
   * instead of the one authoritative for the target, and would run under a
   * bound the forwarding registry resolved locally rather than the target's
   * own authoritative default. Keyed by targetId.
   */
  private readonly catchAllHandlers = new Map<string, ActionHandler | CrossHopRoute>();

  /**
   * Map of target IDs to the reservations standing against them.
   * Consulted by deferred retirement to know when a target's reservations
   * have drained.
   */
  private readonly pendingActions = new Map<string, Set<Promise<void>>>();

  /**
   * Targets whose retirement has taken effect logically but not yet
   * physically (`cpt-frontx-adr-action-dispatch-and-chaining`, "deferred
   * retirement"). A retired target stops resolving for any NEW dispatch
   * (`resolveHandler` consults this set first) while its physical handler
   * registrations in `actionHandlers`/`catchAllHandlers`/`targetDomainMap`
   * stay in place so a reservation already taken against it — most notably
   * the entity's own `destroyed`-stage chain, which routinely targets the
   * very entity being torn down — still finds its handler. Physical removal
   * happens on drain, in `untrackPendingAction`, bounded by nothing but the
   * reserving chain's own per-node bounds (no separate deadline is needed:
   * every reservation belongs to a node attempt that is itself bounded, so
   * the drain is guaranteed rather than merely hoped for).
   */
  private readonly retiredTargets = new Set<string>();

  /**
   * Actions whose node holds a reservation taken BEFORE `resolveHandler` was
   * ever asked to resolve them — today, exactly the actions
   * `acceptSingleNodeForHop` reserves at acceptance, ahead of the scheduled
   * microtask that resolves and executes them. Consulted by `resolveHandler`
   * so a node holding such a reservation keeps its target's handler
   * reachable even where the target is retired in the gap between
   * acceptance and execution: retirement excludes a target from a NEW
   * dispatch only, and must never turn a standing reservation into a
   * missing-handler failure (`inst-reservation-keeps-handler`). Keyed by the
   * `Action` object itself — never by target id, which every dispatch to
   * that target shares — so only the specific reserved node bypasses
   * retirement, never an unrelated new dispatch to the same (retired)
   * target arriving into the same drain window.
   */
  private readonly actionsReservedBeforeResolution = new WeakSet<Action>();

  /**
   * Structured diagnostic sink a node failure is reported through
   * (`inst-diagnostic-record`) — the SAME sink instance
   * `DefaultMfeRegistry` wires into `DefaultLifecycleManager` for a
   * lifecycle hook's dispatch refusal, injected here via
   * `MfeRegistryConfig.diagnosticSink`, or a `console.error`-based default
   * when a host (or a test constructing this mediator directly) supplies
   * none.
   */
  private readonly diagnosticSink: MfeDiagnosticSink;

  /**
   * Set exactly once, by `dispose()`, when the registry whose executor this
   * mediator IS has been disposed. A lifetime boundary on every execution
   * this executor holds, never an outcome of any action
   * (`cpt-frontx-adr-action-dispatch-and-chaining`, `inst-executor-teardown-ends`):
   * consulted at the one point in `executeChainRecursive` where a node's own
   * attempt has just settled (success or failure alike) and this executor is
   * about to select `next`/`fallback` or record a chain-failure diagnostic
   * for it, and inside `acceptSingleNodeForHop`'s scheduled microtask, before
   * that microtask invokes anything for a node this executor accepted but
   * had not yet started running.
   */
  private disposed = false;

  /**
   * Teardown callbacks for every attempt this executor CURRENTLY holds
   * (`inst-executor-teardown-ends`) — one per in-flight `executeLocalNode`
   * call, added when that attempt starts and removed, in its own `finally`,
   * the instant it settles. `dispose()` invokes every callback registered at
   * the moment it runs, exactly once each, which is what ends every
   * currently-held execution "at once" rather than one at a time as each
   * happens to notice `disposed`. Bounded by construction: an attempt that
   * has already settled has already removed its own callback, so this set
   * never grows past the number of attempts genuinely in flight, however
   * many attempts this long-lived executor runs over its lifetime.
   */
  private readonly teardownCallbacks = new Set<() => void>();

  constructor(config: {
    typeSystem: TypeSystemPlugin;
    getDomainState: (domainId: string) => ExtensionDomainState | undefined;
    getExtensionEntry: (extensionId: string) => MfeEntry | undefined;
    resolveForwardingEntry?: (targetId: string, arrivalEdge: unknown) => CrossHopRoute | undefined;
    resolveEscalation?: () => CrossHopRoute | undefined;
    diagnosticSink?: MfeDiagnosticSink;
  }) {
    super();
    this.typeSystem = config.typeSystem;
    this.getDomainState = config.getDomainState;
    this.getExtensionEntry = config.getExtensionEntry;
    this.resolveForwardingEntry = config.resolveForwardingEntry;
    this.resolveEscalation = config.resolveEscalation;
    this.diagnosticSink = config.diagnosticSink ?? new ConsoleDiagnosticSink();
  }

  /**
   * Accept an action chain: validate its envelope and every declared
   * per-action timeout synchronously (refusing with `ActionsChainRefusalError` on any
   * violation), then hand it to the executor's own "observed execution"
   * (`runAcceptedChain`) WITHOUT awaiting it. This is what lets acceptance
   * reserve what the first executable node needs before this call returns
   * (`inst-reserve-first-node`): calling an async function executes its
   * synchronous prefix — resolving the first node's handler, admitting the
   * action, and adding its reservation — immediately, in the
   * same synchronous turn as this call, and only the first genuinely
   * asynchronous step (invoking the resolved handler) defers to a microtask.
   *
   * Never returns a value and never yields anything an emitter could await
   * for the chain's own execution; the completion-bearing `runAcceptedChain`
   * is deliberately NOT part of the exported abstract `ActionsChainsMediator`.
   *
   * @param chain - The actions chain to accept.
   * @throws {ActionsChainRefusalError} synchronously on a malformed chain,
   *   or an invalid declared per-action timeout.
   */
  // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-invoke-execute
  executeActionsChain(chain: ActionsChain): void {
    try {
      validateChainEnvelope(chain);
    } catch (error) {
      // Every refusal — not only a node failure — is attributed through the
      // same substitutable sink (`inst-diagnostic-record`), reusing the
      // node-failure shape and the existing refusal classification rather
      // than a parallel taxonomy. Reported BEFORE rethrowing: the throw
      // itself, the contract with this call's caller, is unchanged.
      reportSynchronousChainRefusal(this.diagnosticSink, chain, error);
      throw error;
    }

    // Fire-and-forget: the executor observes its own settlement internally.
    // Never awaited here — see method doc for why that is load-bearing.
    void this.runAcceptedChain(chain).catch((error) => {
      console.error('[ActionsChainsMediator] Unhandled error in accepted chain execution', error);
    });
  }
  // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-invoke-execute

  /**
   * Observed execution of an already-accepted chain: the completion-bearing
   * operation the executor uses to select `next`/`fallback`. Package-private
   * (not on the exported abstract `ActionsChainsMediator`) — reachable only
   * by code that holds this concrete mediator.
   *
   * `executeActionsChain`'s own acceptance never awaits this (see above), and
   * neither does `DefaultMfeRegistry.executeActionsChain` (the public,
   * registry-level facade) — that facade is itself fire-and-forget. Only
   * `DefaultMfeRegistry`'s private, completion-bearing `executeAndAwaitChain`
   * awaits it directly, after independently calling `validateChainEnvelope`
   * itself for the same synchronous-refusal guarantee — the executor's own
   * settlement observer for the registry's own fire-and-forget dispatch,
   * and its ONLY caller — `cpt-frontx-adr-mfe-runtime-public-surface`'s
   * concern is keeping that completion-bearing path off the PUBLIC surface,
   * not this internal one.
   *
   * @internal
   */
  async runAcceptedChain(chain: ActionsChain): Promise<ChainSettlement> {
    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-create-executor-state
    // The executor's own state for this chain: the execution-path
    // accumulator, and the diagnostic context every refusal and node
    // failure of this chain is attributed by. A fresh correlation identity
    // for this whole accepted-chain execution, plus the origin (if any)
    // tagged onto its root action BEFORE this call — today, only by
    // `DefaultLifecycleManager` for a lifecycle-hook dispatch. Threaded by
    // reference through every recursive `next`/`fallback` call and, across
    // a hop, through the cross-hop envelope's `diagnostics` field
    // (`inst-diagnostic-record`).
    const path: string[] = [];
    const diagnosticContext: DiagnosticContext = {
      correlationId: nextDispatchCorrelationId(),
      origin: getDispatchOrigin(chain.action),
    };
    // De-duplicates diagnostic reporting for one underlying `Error` object
    // within THIS ONE accepted execution. Each node's failure is settled
    // entirely within its own call frame and returned outward rather than
    // rethrown (`inst-end-at-node`), so no ancestor frame's catch is
    // expected to observe the same error object again; this set is kept as
    // a defensive single-report guarantee regardless. Reporting once, at
    // the FIRST catch that sees a given error, is what lets `target` in
    // the reported diagnostic name the
    // node that actually failed rather than an ancestor merely re-observing
    // it. Deliberately created FRESH here, per accepted execution, rather
    // than held as mediator-instance state: a mediator-wide set would
    // silently swallow a later, INDEPENDENT dispatch's own report of the
    // very same `Error` OBJECT (e.g. a handler that caches and rethrows one
    // static instance across dispatches) — scoping it to one execution and
    // threading it by reference alongside `path`/`diagnosticContext` is what
    // guarantees it can never leak across dispatches while still spanning
    // this whole execution — a hand-over across a hop ends this runtime's
    // own recursion outright (`executeCrossHopNode`), so this set never
    // needs to span a round trip: the far side mints its own, fresh, via
    // its own `acceptSingleNodeForHop`.
    const reportedFailures = new WeakSet<object>();
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-create-executor-state
    try {
      return await this.executeChainRecursive(chain, path, diagnosticContext, reportedFailures);
    } catch {
      // Every node failure on this chain was already reported to
      // `diagnosticSink` at the point it was first caught, inside
      // `executeChainRecursive` — nothing further to log here, and no
      // second, parallel reporting path.
      return { completed: false, path };
    }
  }

  /**
   * ACCEPT exactly ONE node on behalf of a remote executor that escalated or
   * forwarded it across a hop (`cpt-frontx-adr-action-dispatch-and-chaining`,
   * the continuation model: "the receiving side executes one node on behalf
   * of the owning executor, it does not accept a new public root"). Never
   * validates a whole-chain envelope: there is no root here, only the single
   * action the sending hop carried, together with its continuations
   * (`Action.next`/`Action.fallback`).
   *
   * Synchronous by construction: everything this method does before
   * returning — validating the action it was handed, minting the execution
   * state (the path accumulator, the fresh execution-scoped
   * `reportedFailures` set, the diagnostic context), and RESERVING what the
   * node needs (`trackPendingAction`, so reserve-before-return holds at the
   * RECEIVING side of a hop exactly as `executeActionsChain` makes it hold
   * at the sending side) — costs nothing and is what lets the delivering
   * runtime treat this call as accepted the instant it returns
   * (`inst-receive-accept-reserve`).
   *
   * What it deliberately does NOT do before returning is INVOKE anything.
   * The node's actual invocation — `handler.handleAction` for a locally
   * resolved node, or the onward transport for a node this registry itself
   * forwards further — is SCHEDULED on a microtask, so no handler code,
   * synchronous prefix included, can run on the delivering runtime's own
   * call stack (`inst-receive-accept-reserve`, `inst-receive-transfer`). A
   * microtask rather than a task: the smallest deferral that guarantees
   * that, while adding no timer and no delay a fake-timer test harness
   * would have to advance. `Promise.resolve().then` rather than
   * `queueMicrotask` for the same reason a fake-timer configuration may
   * replace the latter.
   *
   * Never rejects and never returns anything: this registry has transferred
   * the sub-chain, and every later failure of that node — a missing
   * handler, an admission failure, a handler that throws, synchronously
   * included, or a timeout — is answered here by the `fallback` this
   * registry dispatches from itself, never surfacing back through the
   * delivery call that accepted this node (`inst-receive-transfer`).
   * Diagnostics for it are reported at the point of first catch inside
   * `executeChainRecursive` — there is no second, parallel reporting path
   * here, and nothing reaches the delivering runtime.
   *
   * @throws {Error} synchronously, BEFORE anything is taken, when the action
   *   handed across the hop is not a well-formed action this registry can
   *   execute — the hop is unavailable, not merely failed, and must be
   *   detectable before acceptance rather than only during execution.
   *
   * @param diagnosticContext - The correlation identity (and, where the
   *   dispatch carried them, the origin AND the sending executor's own
   *   accumulated path so far) of the SENDING executor's own dispatch,
   *   reconstructed by the caller (`DefaultMfeRegistry.receiveCrossHopNode`)
   *   from the received envelope's `diagnostics` field, so a node failure at
   *   THIS end of the hop still attributes to the dispatch that crossed into
   *   it rather than minting a fresh, disconnected identity — and so the
   *   structured diagnostic this node's own failure boundary may report
   *   carries the FULL path attempted so far, not merely this one remote
   *   node in isolation (`senderPath`, `dispatch-diagnostics.ts`). Absent
   *   when the received envelope carried no recognizable diagnostics record,
   *   in which case a fresh identity is minted here instead and the local
   *   path starts empty, exactly as it always has.
   *
   * @internal
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-receive-accept-reserve
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-receive-transfer
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-receive-refusal-check
  acceptSingleNodeForHop(chain: ActionsChain, diagnosticContext?: DiagnosticContext): void {
    // Validated BEFORE anything is taken — the COMPLETE handed-over
    // sub-chain, not merely its root action: envelope shape of every node
    // including its continuations, cycle refusal, and declared-timeout
    // validity, reusing the IDENTICAL validator `executeActionsChain` uses
    // for a whole-chain root. A malformed hand-over is a hop this registry
    // cannot take the node for at all — refused here, synchronously,
    // BEFORE any reservation is taken, leaving no state at this receiver.
    validateChainEnvelope(chain);
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-receive-refusal-check
    const action = chain.action;
    const context: DiagnosticContext =
      diagnosticContext ?? { correlationId: nextDispatchCorrelationId(), origin: getDispatchOrigin(action) };
    // Seeds the local path accumulator with the sender's own accumulated
    // path (if any carried across the hop) so a structured diagnostic
    // reported for THIS node's own failure boundary names every node
    // attempted so far, not a disconnected single entry — see
    // `DiagnosticContext.senderPath`'s own doc.
    const path: string[] = context.senderPath ? [...context.senderPath] : [];
    // Fresh per this single-node execution, exactly like `runAcceptedChain`'s
    // own — never shared with any other execution, including the SENDING
    // executor's (a different mediator instance's own recursion entirely).
    const reportedFailures = new WeakSet<object>();

    // ── PREPARATION (synchronous, before this call returns) ───────────────
    //
    // Deliberately does NOT resolve the node: an actions chain is
    // history-agnostic, so what a node does must follow from the state that
    // holds at the moment that node EXECUTES, never from a lookup taken a
    // microtask earlier. A handler registration, forwarding entry, or
    // escalation link that changes in the gap between this acceptance and
    // the scheduled invocation must therefore be the one the node runs
    // against. Nothing about acceptance depends on resolution having already
    // happened: a handler missing at execution time is an ordinary CHAIN
    // failure answered by the chain's `fallback`
    // (`inst-no-handler`/`inst-chain-failure-class`), not a refusal, so
    // acceptance is meaningful with only what follows — validation of what
    // it was handed, the node's execution state, and the reservation.

    // RESERVE before returning — but ONLY where this registry is itself the
    // one that will execute the node for THIS action's (target, actionType)
    // pair (`wouldResolveLocallyNow`): a runtime that merely holds a route
    // onward, through a forwarding entry or the escalation tier, never
    // reserves for a node it hands across another hop
    // (`cpt-frontx-adr-action-dispatch-and-chaining`: "the executor MUST NOT
    // reserve anything for a first node bound for another runtime"), and
    // neither does a runtime whose target is already logically retired at
    // this very acceptance — a target excluded from every NEW dispatch is
    // excluded from this one too, so it gets no reservation and no
    // resolution bypass, and fails inside ITS OWN failure boundary at
    // execution time exactly like any other new dispatch to a retired
    // target. Where it IS local (and not retired), this closes the window
    // — between this acceptance and the scheduled microtask — in which a
    // target this registry has already promised to execute a node for
    // would otherwise hold no reservation at all and could be physically
    // torn down. Released once the node's own attempt settles, so the
    // drain in `untrackPendingAction` still measures exactly the
    // reservations standing against the target.
    const isLocal = this.wouldResolveLocallyNow(action.target, action.type);
    let releaseAcceptanceReservation: (() => void) | undefined;
    let acceptanceTeardownCallback: (() => void) | undefined;
    if (isLocal) {
      let settleAcceptance!: () => void;
      const acceptanceReservation = new Promise<void>((resolve) => {
        settleAcceptance = resolve;
      });
      this.trackPendingAction(action.target, acceptanceReservation);
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-reservation-keeps-handler
      // Marked BEFORE `resolveHandler` ever resolves this action (that
      // resolution happens only inside the scheduled microtask below), so a
      // target retired in the gap between this acceptance and that
      // microtask still resolves for THIS node.
      this.actionsReservedBeforeResolution.add(action);
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-reservation-keeps-handler

      // Guarded so it fires exactly once: this IS this node's own
      // reservation (`inst-add-inflight`'s "unless it already holds the
      // reservation taken for it at acceptance") — `executeChainRecursive`/
      // `executeLocalNode` never take a second, separate one for this same
      // node, and release it at THIS node's own terminal disposition —
      // success, failure, timeout, a successful onward hand-over, or a
      // refused one — strictly BEFORE recursing into `next`/`fallback`, so
      // the drain in `untrackPendingAction` measures exactly the
      // reservations standing against the target and never counts a node's
      // own downstream continuations against it.
      let acceptanceReservationReleased = false;
      releaseAcceptanceReservation = (): void => {
        if (acceptanceReservationReleased) {
          return;
        }
        acceptanceReservationReleased = true;
        settleAcceptance();
        this.untrackPendingAction(action.target, acceptanceReservation);
      };

      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-executor-teardown-ends
      // This acceptance-scoped reservation is held from THIS synchronous
      // call onward — before the scheduled microtask below has even had a
      // chance to run — so `dispose()` must be able to release it
      // synchronously too, exactly like an in-flight `executeLocalNode`
      // attempt's own callback: a node accepted but not yet started is
      // still an execution this executor "holds" for `inst-executor-teardown-ends`'s
      // purposes. Removed the instant the scheduled microtask below runs
      // (whether it finds the executor disposed, in which case this
      // callback already released the reservation and the removal is a
      // no-op, or proceeds to start the node, at which point `executeLocalNode`'s
      // own callback takes over the SAME `releaseAcceptanceReservation` via
      // `ownReservationRelease`) — never left registered past that point.
      acceptanceTeardownCallback = (): void => releaseAcceptanceReservation!();
      this.teardownCallbacks.add(acceptanceTeardownCallback);
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-executor-teardown-ends
    }
    // Where NOT local, `releaseAcceptanceReservation` stays `undefined`:
    // threaded through as `ownReservationRelease` exactly like a chain
    // root's, so `executeLocalNode` takes its OWN, ordinary reservation if
    // the node turns out to resolve locally after all by execution time,
    // and a genuinely cross-hop node takes none, anywhere, consistent with
    // `inst-hand-over-node`.

    // ── EXECUTION (scheduled, strictly after this method returns) ─────────
    // Fire-and-forget, exactly like `executeActionsChain`'s own acceptance:
    // nobody is watching this settlement from the sending side, so nothing
    // is resolved or rejected for it.
    void Promise.resolve().then(() => {
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-executor-teardown-ends
      // This microtask is the one point at which the acceptance-scoped
      // reservation's own subscription (registered above, still live if
      // `dispose()` has not already run it) is superseded: either this node
      // is about to start — `executeLocalNode` registers its OWN callback
      // for the SAME release, threaded through as `ownReservationRelease` —
      // or, for a node that fails/hands-over before ever reaching
      // `executeLocalNode`, that release runs synchronously within this
      // very microtask, with no further `await` for `dispose()` to race
      // against. Removed here, unconditionally, before either of those
      // happens — a harmless no-op if `dispose()` already invoked it and
      // cleared the whole set.
      if (acceptanceTeardownCallback) {
        this.teardownCallbacks.delete(acceptanceTeardownCallback);
      }

      // This executor's own teardown between acceptance (above, already
      // returned) and this scheduled microtask is the same lifetime
      // boundary as a mid-attempt teardown: it starts no new node after its
      // own disposal (`cpt-frontx-adr-action-dispatch-and-chaining`). The
      // reservation acceptance already took was released synchronously,
      // the instant `dispose()` ran the callback above (or, absent that
      // callback ever having been registered — a non-local node — there
      // was never anything to release) — this check exists only to skip
      // starting the node, never to release anything itself.
      if (this.disposed) {
        return;
      }
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-executor-teardown-ends

      // The FULL node — its continuations included, per `chain` here —
      // rather than a synthesized single-action wrapper: this is what lets
      // this registry dispatch the node's own `next`/`fallback` from
      // itself once it executes (`inst-dispatch-continuation`). The
      // acceptance reservation is threaded in as THIS node's own — released
      // at its own terminal disposition inside `executeChainRecursive`,
      // never held open across its `next`/`fallback` recursion — with the
      // guarded release above as a backstop for any path that does not run
      // through it (there is none today, but the guard costs nothing and
      // keeps this call-site independent of that internal detail).
      this.executeChainRecursive(
        chain,
        path,
        context,
        reportedFailures,
        releaseAcceptanceReservation
      ).then(releaseAcceptanceReservation, releaseAcceptanceReservation);
    });
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-receive-transfer
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-receive-accept-reserve

  /**
   * Execute a chain node recursively with success/failure branching.
   *
   * @param chain - The chain node to execute
   * @param path - Accumulated path of executed actions
   * @param diagnosticContext - The correlation identity (and, where the
   *   dispatch carried them, the origin) of the ONE dispatch this whole
   *   recursion belongs to — minted once by `runAcceptedChain`/
   *   `acceptSingleNodeForHop` (the latter minting it as part of the
   *   execution state it establishes before accepting the hop) and
   *   threaded by reference through every recursive `next`/`fallback`
   *   call, never re-minted per node.
   * @param reportedFailures - EXECUTION-scoped de-duplication of diagnostic
   *   reporting for one underlying `Error` OBJECT, kept as a defensive
   *   single-report guarantee for THIS ONE execution even though each
   *   node's own failure is settled entirely within its own call frame and
   *   returned outward rather than rethrown (`inst-end-at-node`) — minted
   *   fresh, once, by `runAcceptedChain`/`acceptSingleNodeForHop` (never as
   *   mediator-instance state, which would leak across independent
   *   dispatches) and threaded by reference alongside `path`/
   *   `diagnosticContext`.
   * @param ownReservationRelease - Present ONLY for the node
   *   `acceptSingleNodeForHop` accepted: releases THIS node's own
   *   acceptance-scoped reservation at its terminal disposition — success,
   *   failure, timeout, a successful onward hand-over, or a refused one —
   *   strictly BEFORE this call recurses into `next`/`fallback` (a fresh
   *   dispatch, never passed this release). Absent for every other node
   *   (a chain root, or any `next`/`fallback` continuation), which take
   *   their own ordinary reservation in `executeLocalNode` instead.
   * @returns Promise resolving to the settlement of this node's own subtree
   */
  // @cpt-algo:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1
  private async executeChainRecursive(
    chain: ActionsChain,
    path: string[],
    diagnosticContext: DiagnosticContext,
    reportedFailures: WeakSet<object>,
    ownReservationRelease?: () => void
  ): Promise<ChainSettlement> {
    const { action } = chain;

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-chain-failure-class
    // This ONE try/catch is what treats every condition discoverable only
    // while an accepted chain is executing — no handler for a well-formed
    // opaque target, an admission failure (`inst-delegate-admit`, below), a
    // declaration failure (`inst-decl-check`), an invalid authoritative
    // domain default (`InvalidDomainDefaultTimeoutError`), a delivery the far
    // side of a hop refuses (`executeCrossHopNode`), an ordinary handler
    // failure, and a handler timeout — uniformly as a CHAIN failure answered
    // by `chain.fallback` (the `catch` block below), never as a refusal:
    // none of them can reach `executeActionsChain`'s own synchronous refusal
    // path, because by the time any of them can occur the chain was already
    // accepted.
    try {
      // Resolved at the moment THIS node is reached — never ahead of time,
      // and never carried in from an earlier phase. Every node resolves the
      // same way, whether it is a chain root, a `next`/`fallback`
      // continuation, or the single node a hop accepted: the outcome follows
      // from the registrations, forwarding entries, and escalation links
      // that hold right now.
      let resolved: ActionHandler | CrossHopRoute | undefined;
      try {
        resolved = this.resolveHandler(action.target, action.type, action, getArrivalEdge(action));
      } finally {
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-reservation-keeps-handler
        // The bypass this membership grants is single-use: dropped the
        // instant this one resolution has been ASKED for — whether it
        // resolved to a local handler, a cross-hop route, nothing at all,
        // or `resolveHandler` itself threw — so a LATER dispatch reusing
        // the same `Action` object is subject to retirement exactly like
        // any other new dispatch, never permanently exempt. `finally` (not
        // a line after the call) is what guarantees this runs on every one
        // of those outcomes, the throwing one included.
        this.actionsReservedBeforeResolution.delete(action);
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-reservation-keeps-handler
      }

      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-no-handler
      if (!resolved) {
        // Reported once, below, via `diagnosticSink` at the point this
        // thrown error is first caught — no separate, parallel log here.
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-throw-no-handler
        throw new NoHandlerForActionTargetError(action.target, action.type);
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-throw-no-handler
      }
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-no-handler

      // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-cross-hop-check
      if (isCrossHopRoute(resolved)) {
        // Synchronous, binary hand-over: throws on refusal (caught below,
        // exactly like any other node failure), or returns having handed
        // the node to the far side, which has already accepted and reserved
        // what it needs (`inst-flow-hand-over`, `inst-hand-over-node`).
        // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-hand-over
        this.executeCrossHopNode(chain, resolved, diagnosticContext, path);
        // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-hand-over
        // A successful onward hand-over is THIS node's own terminal
        // disposition: release its acceptance reservation now, before
        // returning — never held open across a `next`/`fallback`. Once
        // handed over, dispatch of this node becomes the receiving registry's
        // responsibility.
        ownReservationRelease?.();
        // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-accepted-continues
        // This runtime's own execution of this node ends HERE: the node is
        // neither appended to `path` as completed nor followed by `next` —
        // branch selection now belongs to the receiving registry, which
        // dispatches the node's continuation from itself
        // (`inst-t-pending-handed-over`, `inst-hand-over-done`). Nothing
        // this runtime does after this point can affect that node again.
        return { completed: false, path: [...path], handedOver: true };
        // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-accepted-continues
      }
      // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-cross-hop-check
      {
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-delegate-admit
        // Admission runs ONLY for a target this registry resolved LOCALLY —
        // never for a forwarding entry, an escalation route, or the
        // converted parent-to-child-domain forwarding tier — and INSIDE this
        // node's own failure boundary, so an admission failure selects the
        // chain's declared `fallback` rather than escaping it. A target
        // identifier this registry's own provider knows nothing about is
        // therefore never reached here at all: it resolves to a CrossHopRoute
        // above, or to `inst-no-handler` — never to a refusal.
        this.typeSystem.register(action);
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-delegate-admit

        // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-decl-check
        this.checkDeclaration(action);
        // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-decl-check

        await this.executeLocalNode(action, resolved, ownReservationRelease);
      }

      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-executor-teardown-ends
      // This attempt just settled (successfully) — `executeLocalNode`'s own
      // `finally` already released its reservation above, disposed or not.
      // A teardown that landed while the attempt was in flight is a
      // lifetime boundary on it, never an outcome of the action: this
      // executor selects neither `next` nor `fallback` for it, dispatches
      // no continuation, and starts no new node
      // (`cpt-frontx-adr-action-dispatch-and-chaining`). Nothing is
      // recorded as a chain failure either — this settlement is not a
      // failure at all — so the return below carries no diagnostic, and
      // `tornDown` marks it as this executor's own teardown boundary rather
      // than an ordinary success, distinct from `completed: false` alone.
      if (this.disposed) {
        return { completed: false, path: [...path], tornDown: true };
      }
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-executor-teardown-ends

      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-success
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-append-path-success
      path.push(action.type);
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-append-path-success

      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-has-next
      if (chain.next) {
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-recurse-success
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-dispatch-continuation
        // Recurses with the SAME path accumulator, diagnostic context, and
        // reported-failures set — never fresh ones — so the whole recursion
        // belongs to one dispatch. This runtime selects `next` from its own
        // outcome alone and dispatches it from itself, routed afresh through
        // `executeChainRecursive`'s own resolution (`resolveHandler`) rather
        // than any path the chain already took.
        return await this.executeChainRecursive(chain.next, path, diagnosticContext, reportedFailures);
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-dispatch-continuation
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-recurse-success
      }
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-has-next

      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-chain-done
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-return-done
      // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-mount-success
      return { completed: true, path: [...path] };
      // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-mount-success
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-return-done
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-chain-done
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-success
    } catch (error) {
      // Released HERE, before anything below recurses into `fallback`: this
      // covers every failure reached before `executeLocalNode` ever ran
      // (missing handler, a refused onward hand-over, an admission or
      // declaration failure, an invalid domain-default timeout) uniformly
      // with a local handler failure or timeout, whose own release already
      // ran inside `executeLocalNode`'s `finally` — the guard in
      // `acceptSingleNodeForHop`'s `releaseAcceptanceReservation` makes a
      // second call here a no-op in that case.
      ownReservationRelease?.();

      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-executor-teardown-ends
      // Same lifetime boundary as the success path above, checked here
      // because a node reaching this catch also just settled — with a
      // failure this time, but disposal still governs it: the reservation
      // is already released (immediately above), and this executor selects
      // neither `next` nor `fallback` for it, dispatches no continuation,
      // and — because this is a teardown boundary rather than a chain
      // failure — records no diagnostic and never reaches
      // `inst-diagnostic-record` or `inst-chain-failure-class` for it
      // (`cpt-frontx-adr-action-dispatch-and-chaining`). `tornDown` marks
      // this settlement as that boundary rather than an ordinary node
      // failure, same as the success-path teardown return above.
      if (this.disposed) {
        return { completed: false, path: [...path], tornDown: true };
      }
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-executor-teardown-ends

      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-failure
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-append-path-failure
      // Appended ONLY at the FIRST catch that sees a given `error` object —
      // the node that actually failed. A node's own failure is settled
      // entirely within its own call frame (`inst-end-at-node`): it is
      // returned outward, never rethrown, so no ancestor frame's catch ever
      // observes the SAME error object again. The `reportedFailures`
      // first-catch guard is kept as a defensive invariant — it costs
      // nothing and keeps this path independent from that guarantee holding
      // elsewhere — so the accumulated path still names each attempted node
      // exactly once, in order. Non-`Error`-object thrown values are not
      // `reportedFailures`-trackable (see its own doc) and are pushed
      // unconditionally to the path (not subject to the first-catch
      // deduplication that applies to trackable Error objects).
      const isTrackable = typeof error === 'object' && error !== null;
      const isFirstCatch = isTrackable && !reportedFailures.has(error);
      if (!isTrackable || isFirstCatch) {
        path.push(action.type);
      }
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-append-path-failure

      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-diagnostic-record
      // Report exactly once per underlying failing node: the FIRST catch
      // that sees a given `error` object is the one whose `action` is the
      // node that actually failed. A node's own failure is settled entirely
      // within its own call frame (`inst-end-at-node`) and returned outward
      // rather than rethrown, so no ancestor frame's catch ever observes
      // the SAME error object again under an unrelated, already-succeeded
      // node's `action` — the first-catch guard is kept as a defensive
      // invariant, not a working necessity.
      if (isFirstCatch) {
        reportedFailures.add(error);
        // Contained (`invokeDiagnosticSinkSafely`): a host-supplied sink
        // that itself throws must never suppress `chain.fallback` below —
        // it would, were this call left unguarded, since an uncaught throw
        // here would propagate straight past the `if (chain.fallback)`
        // check that follows.
        invokeDiagnosticSinkSafely(
          () =>
            this.diagnosticSink.reportChainNodeFailure({
              classification: 'chain-node-failure',
              path: [...path],
              target: action.target,
              failureClass: classifyChainNodeFailure(error),
              ...(hopFailureCauseOf(error) !== undefined
                ? { hopFailureCause: hopFailureCauseOf(error) }
                : {}),
              correlationId: diagnosticContext.correlationId,
              ...(diagnosticContext.origin
                ? {
                    originEntityKind: diagnosticContext.origin.entityKind,
                    originEntityId: diagnosticContext.origin.entityId,
                    originStageId: diagnosticContext.origin.stageId,
                  }
                : {}),
            }),
          'reporting a chain node failure'
        );
      }
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-diagnostic-record

      // Every condition that reaches this catch — including a delivery the
      // far side of a hop refuses — is a chain failure with no exception:
      // the outcome is binary, so this node selects `fallback` exactly as
      // any other failure does. There is no third outcome and nothing here
      // takes "no branch" (`inst-chain-failure-class`).

      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-has-fallback
      if (chain.fallback) {
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-recurse-fallback-algo
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-dispatch-continuation
        // Attempted under the SAME path accumulator, diagnostic context, and
        // reported-failures set — never fresh ones — per
        // `cpt-frontx-adr-action-dispatch-and-chaining`. This runtime
        // selects `fallback` from its own outcome alone and dispatches it
        // from itself, routed afresh rather than retracing the chain's path.
        return await this.executeChainRecursive(chain.fallback, path, diagnosticContext, reportedFailures);
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-dispatch-continuation
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-recurse-fallback-algo
      }
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-has-fallback

      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-no-fallback-algo
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-end-at-node
      // A failed node with no fallback of its OWN ends the chain HERE: this
      // returns a non-completed settlement rather than throwing, so this
      // node's failure is settled entirely within this call frame and is
      // never re-caught by, and never selects the fallback of, the node
      // that dispatched this continuation (`next` or `fallback`) — that
      // ancestor's own `await this.executeChainRecursive(...)` sits inside
      // ITS OWN try, and a value RETURNED to it (never thrown past it) is
      // simply forwarded outward as this node's own settlement, exactly like
      // any other terminal disposition.
      return { completed: false, path: [...path] };
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-end-at-node
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-no-fallback-algo
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-failure
    }
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-chain-failure-class
  }

  /**
   * Runtime entry declaration validation (second layer, after GTS schema
   * validation). GTS alone enforces schema/target shape; this layer enforces
   * per-entry opt-in: the target entry must declare the action.type in its
   * `actions` — the set of action types the entry is capable of receiving
   * and executing. `entry.domainActions` is a different contract (it names
   * domain actions the entry REQUIRES from its parent domain, not actions
   * the entry can receive) and is NOT consulted here. Infrastructure
   * lifecycle actions target domains (not extensions) and are exempt.
   * Checked hierarchy-aware via the injected typeSystem (not a literal Set)
   * so a domain-declared derived variant of load_ext/mount_ext/unmount_ext is
   * still recognized as infrastructure. If the target has no registered
   * entry (domain target, or unregistered extension in bypassed-registration
   * test setups) the check is a no-op — domain targets are validated by GTS
   * `x-gts-ref`, and unregistered targets surface via handler resolution.
   */
  private checkDeclaration(action: Action): void {
    if (isInfrastructureLifecycleAction(action.type, this.typeSystem)) {
      return;
    }
    const entry = this.getExtensionEntry(action.target);
    if (entry && !entry.actions.includes(action.type)) {
      throw new Error(
        `Action type '${action.type}' is not declared by target entry '${entry.id}'`
      );
    }
  }

  /**
   * Execute one node's action against a LOCALLY resolved handler, under
   * exactly its own per-action timeout — the action's own declared timeout,
   * or the authoritative domain's default absent one — and nothing else
   * (`cpt-frontx-adr-action-dispatch-and-chaining`).
   */
  private async executeLocalNode(
    action: Action,
    handler: ActionHandler,
    ownReservationRelease?: () => void
  ): Promise<void> {
    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-resolve-timeout
    const perActionTimeout = this.resolveTimeout(action);
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-resolve-timeout
    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-effective-action-bound
    // The node's own per-action bound is the ONLY bound enforced here;
    // `action.timeout` itself is never overwritten, and nothing accumulated
    // by preceding nodes, hops, or transit narrows it.
    const effectiveTimeout = perActionTimeout;
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-effective-action-bound

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-add-inflight
    // Reserve this node against its target BEFORE the handler is invoked
    // below (`inst-reserve-first-node`) — UNLESS it already holds the
    // reservation taken for it at acceptance (`ownReservationRelease`
    // present): that acceptance-scoped reservation IS this node's own, and
    // a second, separate one here would double-count it against the
    // target's drain. Where no such reservation exists (a chain root, or a
    // `next`/`fallback` continuation dispatched afresh), a placeholder
    // promise is tracked first, settled only once the handler's own promise
    // (constructed and awaited afterward) itself settles, so a
    // synchronously re-entrant handler that attempts to retire its own
    // target during its own first synchronous turn finds the reservation
    // already standing. Constructing `executeWithTimeout`'s promise is what
    // invokes `handler.handleAction` (its executor calls `fn()`
    // synchronously) — that invocation must never happen before a
    // reservation exists, whichever one it is.
    let settleTracking: (() => void) | undefined;
    let trackingPromise: Promise<void> | undefined;
    if (!ownReservationRelease) {
      trackingPromise = new Promise<void>((resolve) => {
        settleTracking = resolve;
      });
      this.trackPendingAction(action.target, trackingPromise);
    }
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-add-inflight

    // Single-shot release of THIS attempt's own reservation — called from
    // either of two independent places: `finally` below, once the attempt
    // settles on its own, or the SYNCHRONOUS teardown callback below,
    // invoked directly (never via a promise reaction) the instant
    // `dispose()` runs it. Guarded so whichever runs first is the only one
    // that has any effect — the target's drain (`untrackPendingAction`)
    // must count this reservation exactly once regardless of which route
    // released it.
    let reservationReleased = false;
    const releaseReservation = (): void => {
      if (reservationReleased) {
        return;
      }
      reservationReleased = true;
      if (ownReservationRelease) {
        ownReservationRelease();
      } else {
        settleTracking!();
        this.untrackPendingAction(action.target, trackingPromise!);
      }
    };

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-executor-teardown-ends
    // This attempt's OWN teardown signal — minted fresh here, never shared
    // with any other attempt — so `dispose()` can end THIS attempt without
    // retaining a subscription for it a moment longer than the attempt
    // itself lives. `teardownSignal` unwinds the `Promise.race` below (a
    // promise reaction is unavoidable for THAT — nothing synchronous can
    // make an already-suspended `await` resume any sooner); `disarmTimer`
    // and `releaseReservation`, in contrast, are invoked directly from
    // `teardownCallback`, in the SAME synchronous turn `dispose()` runs it
    // in, so this attempt's timer is cleared and its reservation released
    // the instant `dispose()` returns — never one microtask later
    // (`inst-executor-teardown-ends`). Registered into `teardownCallbacks`
    // below and removed from it, in `finally`, the instant this attempt
    // settles by any route: a long-lived executor that runs many attempts
    // over its lifetime never accumulates more live subscriptions than
    // attempts genuinely in flight.
    let settleTeardown!: () => void;
    const teardownSignal = new Promise<void>((resolve) => {
      settleTeardown = resolve;
    });
    let disarmTimer: (() => void) | undefined;
    const teardownCallback = (): void => {
      disarmTimer?.();
      releaseReservation();
      settleTeardown();
    };
    this.teardownCallbacks.add(teardownCallback);
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-executor-teardown-ends

    try {
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-invoke-within-timeout
      // @cpt-begin:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-admitted-mount
      const actionPromise = this.executeWithTimeout(
        () => handler.handleAction(action.type, action.payload),
        effectiveTimeout,
        (disarm) => {
          disarmTimer = disarm;
        }
      );
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-executor-teardown-ends
      // Raced against this attempt's own teardown signal rather than
      // awaited alone: a handler that never settles at all — or one still
      // running when `dispose()` is called — must never keep this attempt
      // (its timer and its reservation included) alive past disposal
      // (`cpt-frontx-adr-action-dispatch-and-chaining`). By the time this
      // race settles via `teardownSignal`, `teardownCallback` has already
      // disarmed the timer and released the reservation synchronously —
      // this `await` resuming is only what unwinds this `async` function's
      // own suspended call frame, not what ends the attempt. `Promise.race`
      // attaches its own settlement handler to `actionPromise` regardless of
      // which side of the race wins, so the handler's eventual resolution or
      // rejection — reached after this attempt has already moved on — is
      // still observed and can never surface as an unhandled rejection.
      await Promise.race([actionPromise, teardownSignal]);
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-executor-teardown-ends
      // @cpt-end:cpt-frontx-flow-extension-domain-governance-admission:p1:inst-admitted-mount
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-invoke-within-timeout
    } finally {
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-remove-inflight
      // Every settlement route — success, handler failure, the per-action
      // timeout firing inside `executeWithTimeout`, and a teardown that
      // already released this reservation synchronously above — lands here
      // exactly once (guarded by `releaseReservation`'s own single-shot
      // flag), so the reservation is released on all of them, BEFORE this
      // node's own caller (`executeChainRecursive`) recurses into
      // `next`/`fallback`.
      releaseReservation();
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-remove-inflight
      // This attempt has now settled by every route — its subscription must
      // not outlive it (`inst-executor-teardown-ends`): removed here
      // unconditionally, whether this attempt settled on its own or was
      // ended by `dispose()` invoking it above.
      this.teardownCallbacks.delete(teardownCallback);
    }
  }

  /**
   * Hand one node's action across a cross-hop route (a downward forwarding
   * entry, an upward escalation, or a converted parent-to-child-domain
   * forwarding tier) and be done with it. Carries no bound, no reservation,
   * and no pending state of this executor's into the hop at all: the node
   * is bounded solely by the timeout resolved at the registry authoritative
   * for its target (`cpt-frontx-adr-action-dispatch-and-chaining`,
   * `inst-flow-hand-over`).
   *
   * Synchronous and binary: `route.send` either throws — refusing the
   * delivery at the call, converted here into the hop's own unavailability
   * so the chain's declared `fallback` answers it from THIS runtime — or
   * returns, having already handed the node's acceptance and reservation to
   * the far side before this call returns. Either way this method never
   * awaits anything: there is nothing left here to wait for
   * (`inst-delivery-binary`, `inst-hand-over-done`).
   *
   * @param path - THIS executor's own accumulated path so far (never
   *   including `action` itself — it has not completed yet), carried across
   *   the hop as `senderPath` so a structured diagnostic reported at the far
   *   end names every node attempted so far, not a disconnected single
   *   entry for the remote node alone.
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-hand-over-node
  private executeCrossHopNode(
    chain: ActionsChain,
    route: CrossHopRoute,
    diagnosticContext: DiagnosticContext,
    path: readonly string[]
  ): void {
    const envelope: CrossHopEnvelope = {
      version: CROSS_HOP_PROTOCOL_VERSION,
      // The full node — its continuations included — rather than a bare
      // action: `ActionsChain.next`/`ActionsChain.fallback` sit alongside
      // `chain.action` on this same object, so handing `chain` itself
      // across the hop is what carries the node's continuations with it
      // (`inst-flow-hand-over`).
      node: chain,
      // Carries THIS dispatch's own correlation identity (and, where it has
      // one, its origin AND its accumulated path so far) across the hop
      // (`inst-diagnostic-record`): the receiving registry's
      // `receiveCrossHopNode` reconstructs it via `fromEnvelopeDiagnostics`
      // and threads it into `acceptSingleNodeForHop`, so a node failure at
      // that far end still attributes to the SAME dispatch, several hops
      // away from wherever it started, with the FULL path leading to it
      // rather than a bare single-entry path for a node that is actually
      // several nodes deep.
      diagnostics: toEnvelopeDiagnostics(diagnosticContext, path),
    };

    // No reservation, no bound, no tracking of any kind held here: a
    // runtime never reserves for a node it hands across a hop
    // (`inst-add-inflight`). Invoked with no await, microtask hop, or
    // deferred callback of any kind between resolution and this call.
    try {
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-delivery-binary
      route.send(envelope);
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-delivery-binary
    } catch (error) {
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-delivery-refused
      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-refused-delivery-fallback
      // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-delivery-refused
      // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-refused-fallback
      // Refused at the call: the far side took nothing, so this has no side
      // effect there. Thrown onward so this node's own failure boundary in
      // `executeChainRecursive` treats it exactly like any other failure —
      // the chain's declared `fallback`, dispatched from THIS runtime.
      throw toHopUnavailability(chain.action.target, error);
      // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-refused-fallback
      // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-delivery-refused
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-refused-delivery-fallback
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-delivery-refused
    }
    // @cpt-begin:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-delivery-accepted
    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-delivery-accepted
    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-hand-over-done
    // Accepted: the far side has already reserved what the node needs, and
    // this runtime is done with it — holding no reservation or other
    // pending state, running no timer, and receiving nothing back
    // (`inst-hand-over-done`).
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-hand-over-done
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-delivery-accepted
    // @cpt-end:cpt-frontx-flow-mfe-host-communication-dispatch-chain:p1:inst-flow-delivery-accepted
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-hand-over-node

  /**
   * Track a pending action for a target.
   *
   * @param targetId - The target ID (domain or extension)
   * @param actionPromise - The action promise to track
   */
  private trackPendingAction(targetId: string, actionPromise: Promise<void>): void {
    let pending = this.pendingActions.get(targetId);
    if (!pending) {
      pending = new Set();
      this.pendingActions.set(targetId, pending);
    }
    pending.add(actionPromise);
  }

  /**
   * Untrack a completed action for a target.
   *
   * @param targetId - The target ID (domain or extension)
   * @param actionPromise - The action promise to untrack
   */
  private untrackPendingAction(targetId: string, actionPromise: Promise<void>): void {
    const pending = this.pendingActions.get(targetId);
    if (pending) {
      pending.delete(actionPromise);
      if (pending.size === 0) {
        this.pendingActions.delete(targetId);
        // The drain this target's deferred retirement (if any) was waiting
        // on just completed — remove its physical registrations now, per
        // `cpt-frontx-adr-action-dispatch-and-chaining`. Bounded by nothing
        // but each reservation's own node-attempt bound: a local node by its
        // own per-action bound, and a hand-over across a hop by the fact
        // that this side holds a reservation for it only until `route.send`
        // returns or throws — a synchronous call with no wait of its own.
        if (this.retiredTargets.has(targetId)) {
          this.physicallyRemoveHandlers(targetId);
        }
      }
    }
  }

  /**
   * Decide, for RESERVATION purposes only, whether this registry is one
   * that will itself EXECUTE a node for THIS `(targetId, actionTypeId)`
   * pair — as opposed to one that merely holds a route onward through a
   * forwarding entry or the escalation tier — WITHOUT resolving (binding or
   * caching) a handler early (`cpt-frontx-adr-action-dispatch-and-chaining`:
   * "each node's handler MUST be resolved when that node executes, never
   * earlier"). Mirrors `resolveHandler`'s own LOCAL tiers exactly — keyed
   * exact match, the hierarchy-derived scan, and a plain local catch-all
   * `ActionHandler` — never `resolveForwardingEntry`/`resolveEscalation`,
   * which by construction only ever resolve to a `CrossHopRoute` a node this
   * registry merely hands onward, never one it executes itself.
   *
   * A target already logically retired (`retiredTargets`) is NEVER local by
   * this predicate, matching `resolveHandler`'s own retirement guard: a
   * target excluded from every NEW dispatch must be excluded from the
   * acceptance reservation and the resolution bypass that accompanies it
   * too, so a delivery received while its target is logically retired but
   * physically retained (another reservation still draining) gets neither —
   * it resolves at execution time exactly as any other new dispatch to a
   * retired target would (excluded), failing inside its OWN failure
   * boundary.
   *
   * A catch-all entry that is itself a `CrossHopRoute` (child-domain
   * forwarding) is NOT local by this test: the node would still be handed
   * onward through it, never executed here. Likewise, a target with SOME
   * locally registered action types but none matching THIS `actionTypeId`
   * (no keyed, no hierarchy-derived, no plain local catch-all) is not local
   * either — it is destined to route onward through a forwarding entry,
   * escalation, or the cross-hop catch-all tier, so reserving it here would
   * reserve an intermediate registry for a node it will never execute.
   *
   * This is otherwise a fast, cheap over-approximation in the other
   * direction only — it may say "not local" for a target that turns out to
   * resolve locally by the time the node actually executes (e.g. a handler
   * registered in the gap between acceptance and the scheduled microtask);
   * that is harmless, since `executeLocalNode` takes its own, ordinary
   * reservation whenever acceptance did not already take one for it,
   * exactly as it does for any freshly dispatched `next`/`fallback`
   * continuation.
   */
  private wouldResolveLocallyNow(targetId: string, actionTypeId: string): boolean {
    if (this.retiredTargets.has(targetId)) {
      return false;
    }

    const targetHandlers = this.actionHandlers.get(targetId);
    if (targetHandlers) {
      if (targetHandlers.has(actionTypeId)) {
        return true;
      }
      for (const registeredActionTypeId of targetHandlers.keys()) {
        if (
          this.typeSystem.isTypeOf(actionTypeId, registeredActionTypeId) ||
          this.typeSystem.isTypeOf(registeredActionTypeId, actionTypeId)
        ) {
          return true;
        }
      }
    }

    const catchAll = this.catchAllHandlers.get(targetId);
    return catchAll !== undefined && !isCrossHopRoute(catchAll);
  }

  /**
   * Resolve the handler for a (targetId, actionTypeId) pair.
   *
   * Resolution order:
   * 1. Check actionHandlers[targetId][actionTypeId] (exact match — the common case)
   * 2. Hierarchy-aware scan of actionHandlers[targetId]'s registered keys, matching
   *    a dispatched ID against a handler registered under a derived (or base) variant
   * 3. Check catchAllHandlers[targetId] (bridge forwarding fallback)
   *
   * Step 2 exists because a domain may register a handler under a
   * hierarchy-derived action ID (e.g. a non-GTS-notation "is-a" mount_ext)
   * while a dispatched action arrives under the framework's base ID, or vice
   * versa — `crossValidateHandlers` already admits such domains via
   * `typeSystem.isTypeOf`, so dispatch must resolve them the same way or the
   * registered handler would be unreachable.
   *
   * 4. Downward forwarding entry, recorded through registration propagation
   *    from a descendant registry — excluding an entry whose bridge equals
   *    the chain's tagged arrival edge, if it carries one (loop containment)
   * 5. Escalation: if this registry holds an inbound bridge (it is not the
   *    shell), a synthesized route bound to it
   *
   * @param targetId - The target type ID (domain or extension)
   * @param actionTypeId - The action type ID
   * @param action - The action object itself, consulted ONLY to test whether
   *   this exact node holds a reservation taken before this resolution
   *   (`inst-reservation-keeps-handler`) — never for its own fields, which
   *   `targetId`/`actionTypeId` already carry.
   * @param arrivalEdge - The bridge this dispatch most recently arrived on, if any
   * @returns The action handler or cross-hop route, or undefined if neither resolves
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-keyed-lookup
  private resolveHandler(
    targetId: string,
    actionTypeId: string,
    action: Action,
    arrivalEdge?: unknown
  ): ActionHandler | CrossHopRoute | undefined {
    // A logically retired target (`unregisterAllHandlers` below) never
    // resolves for a NEW dispatch, even while its physical registrations
    // are still retained for reservations already taken against it.
    //
    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-reservation-keeps-handler
    // EXCEPT for a node that already holds such a reservation, taken before
    // this resolution ever ran (`acceptSingleNodeForHop`,
    // `actionsReservedBeforeResolution`): that node keeps its target's
    // handler reachable until its own attempt settles, even where the
    // target was retired in the meantime — retirement excludes the target
    // from a NEW dispatch only, and never turns a standing reservation into
    // a missing-handler failure. A `next`/`fallback` continuation dispatched
    // afresh from this node is a NEW dispatch with its own fresh `Action`
    // object, so it is never in this set and is refused exactly like any
    // other new dispatch to a retired target.
    if (this.retiredTargets.has(targetId) && !this.actionsReservedBeforeResolution.has(action)) {
      return undefined;
    }
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-reservation-keeps-handler

    // Check per-(target, actionType) handler first
    const targetHandlers = this.actionHandlers.get(targetId);
    if (targetHandlers) {
      const handler = targetHandlers.get(actionTypeId);
      if (handler) {
        return handler;
      }

      // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-hierarchy-lookup
      // Hierarchy-aware fallback: match the dispatched ID against each
      // registered key in either derivation direction.
      for (const [registeredActionTypeId, registeredHandler] of targetHandlers) {
        if (
          this.typeSystem.isTypeOf(actionTypeId, registeredActionTypeId) ||
          this.typeSystem.isTypeOf(registeredActionTypeId, actionTypeId)
        ) {
          return registeredHandler;
        }
      }
      // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-hierarchy-lookup
    }

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-catchall-lookup
    // Fall back to catch-all tier (used for child domain forwarding via
    // bridge transport). Resolves to a CrossHopRoute wherever the matched
    // target sits across a runtime boundary, never to a plain ActionHandler.
    const catchAll = this.catchAllHandlers.get(targetId);
    if (catchAll) {
      return catchAll;
    }
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-catchall-lookup

    // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-forwarding-entry-lookup
    if (this.resolveForwardingEntry) {
      const forwardingRoute = this.resolveForwardingEntry(targetId, arrivalEdge);
      if (forwardingRoute) {
        return forwardingRoute;
      }
    }
    // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-forwarding-entry-lookup

    // Calls the injected escalation-tier resolver (realizes
    // inst-escalation-lookup; canonical marker kept at
    // DefaultMfeRegistry.resolveEscalationRoute to avoid a second code
    // location for the same instruction ID).
    if (this.resolveEscalation) {
      const escalationRoute = this.resolveEscalation();
      if (escalationRoute) {
        return escalationRoute;
      }
    }

    return undefined;
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-keyed-lookup

  /**
   * Resolve the per-action timeout for an action: the action's own declared
   * timeout — already validated at acceptance
   * (`chain-envelope-validator.ts`) — or, absent one, the target domain's
   * `defaultActionTimeout`, validated HERE, at the point the default is
   * resolved, to the identical valid form ADR
   * `cpt-frontx-adr-action-dispatch-and-chaining` holds a declared timeout
   * to (positive, finite, integer, schedulable): a domain's own default is
   * never validated up front, since a domain declaration is not itself an
   * accepted chain the envelope validator ever sees. An invalid default
   * throws `InvalidDomainDefaultTimeoutError` — caught by this node's own
   * failure boundary in `executeChainRecursive`, so it selects the chain's
   * declared `fallback` rather than escaping as a refusal to an emitter who
   * may never even dispatch to this target.
   *
   * Synchronous — `getDomainState` is itself a synchronous callback, so
   * nothing here does genuinely async work, and keeping this synchronous is
   * what lets `executeActionsChain`'s acceptance reserve the first node
   * before it returns, rather than yielding to a microtask first.
   *
   * @param action - The action
   * @returns The timeout in milliseconds
   */
  private resolveTimeout(action: Action): number {
    if (action.timeout !== undefined) {
      return action.timeout;
    }

    const domain = this.resolveDomain(action.target);
    if (domain) {
      if (!isValidDeclaredTimeout(domain.defaultActionTimeout)) {
        throw new InvalidDomainDefaultTimeoutError(domain.id, domain.defaultActionTimeout);
      }
      return domain.defaultActionTimeout;
    }

    throw new Error('Cannot resolve timeout: no domain found for target "' + action.target + '"');
  }

  /**
   * Resolve the domain for a target.
   *
   * Resolution order:
   * 1. Direct domain lookup (target is a domain ID)
   * 2. Extension→domain lookup via targetDomainMap
   *
   * @param targetId - The target type ID
   * @returns The domain, or undefined if not found
   */
  private resolveDomain(targetId: string): ExtensionDomain | undefined {
    const domainState = this.getDomainState(targetId);
    if (domainState) {
      return domainState.domain;
    }

    const domainId = this.targetDomainMap.get(targetId);
    if (domainId) {
      const extensionDomainState = this.getDomainState(domainId);
      if (extensionDomainState) {
        return extensionDomainState.domain;
      }
    }

    return undefined;
  }

  /**
   * Execute a promise with timeout.
   *
   * @param fn - The async function to execute
   * @param timeout - Timeout in milliseconds
   * @param onTimerArmed - Invoked SYNCHRONOUSLY, before this method's own
   *   `Promise` constructor callback returns, with a disarm function that
   *   clears this attempt's timer directly. Handed to the caller
   *   (`executeLocalNode`) rather than driven off a teardown `Promise`
   *   reaction: a promise reaction is at minimum one microtask removed from
   *   whatever settled that promise, so a caller that needs the timer gone
   *   the INSTANT `dispose()` returns — not one microtask later
   *   (`inst-executor-teardown-ends`) — must be able to call this disarm
   *   function itself, synchronously, from its own teardown callback.
   *   Calling it more than once, or after `fn()` has already settled the
   *   timer via its own `clearTimeout` below, is a harmless no-op — clearing
   *   an already-cleared (or nonexistent) timer does nothing.
   * @returns Promise that resolves with the function result or rejects on timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number,
    onTimerArmed: (disarm: () => void) => void
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timeout after ${timeout}ms`));
      }, timeout);

      // Handed to the caller synchronously, in this same call — never via a
      // promise reaction — so the caller's own teardown callback can disarm
      // this timer directly, in the same synchronous turn `dispose()` runs
      // that callback in.
      onTimerArmed(() => clearTimeout(timer));

      fn()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Register a handler for a specific (targetId, actionTypeId) pair.
   *
   * @param targetId - ID of the target (domain or extension)
   * @param actionTypeId - The action type this handler handles
   * @param handler - Handler function to invoke
   * @param domainId - Optional domain ID for extension targets (enables timeout resolution)
   */
  registerHandler(
    targetId: string,
    actionTypeId: string,
    handler: ActionHandler,
    domainId?: string
  ): void {
    let targetHandlers = this.actionHandlers.get(targetId);
    if (!targetHandlers) {
      targetHandlers = new Map();
      this.actionHandlers.set(targetId, targetHandlers);
    }
    targetHandlers.set(actionTypeId, handler);

    // Track extension→domain mapping for timeout resolution
    if (domainId !== undefined) {
      this.targetDomainMap.set(targetId, domainId);
    }
  }

  /**
   * Unregister a handler for a specific (targetId, actionTypeId) pair.
   *
   * @param targetId - ID of the target
   * @param actionTypeId - The action type to unregister
   */
  unregisterHandler(targetId: string, actionTypeId: string): void {
    const targetHandlers = this.actionHandlers.get(targetId);
    if (targetHandlers) {
      targetHandlers.delete(actionTypeId);
      if (targetHandlers.size === 0) {
        this.actionHandlers.delete(targetId);
        this.targetDomainMap.delete(targetId);
      }
    }
  }

  /**
   * Retire a target — a domain or an extension whose registration is
   * ending. Used by the teardown transitions (an extension being
   * unregistered, a domain being unregistered) alongside a non-blocking
   * lifecycle-stage trigger whose own chains routinely target the very
   * entity being retired.
   *
   * Per `cpt-frontx-adr-action-dispatch-and-chaining` ("deferred target
   * retirement"), retirement takes effect logically and immediately — the
   * target stops resolving for any NEW dispatch (`resolveHandler` above) —
   * and physically only once every reservation already taken against it
   * has drained (`untrackPendingAction` above). This call never throws and
   * never waits: if nothing is pending right now, physical removal happens
   * immediately; otherwise it is deferred to the drain, bounded by nothing
   * but each reservation's own settlement.
   *
   * @param targetId - ID of the target being retired
   */
  unregisterAllHandlers(targetId: string): void {
    this.retiredTargets.add(targetId);

    const pending = this.pendingActions.get(targetId);
    if (!pending || pending.size === 0) {
      this.physicallyRemoveHandlers(targetId);
    }
    // else: reservations are still standing against this target — its
    // physical registrations stay in place until `untrackPendingAction`
    // observes the drain and removes them.
  }

  /**
   * Physically remove a retired target's handler registrations. Called
   * either immediately by `unregisterAllHandlers` (nothing was pending) or
   * later by `untrackPendingAction` (on drain).
   */
  private physicallyRemoveHandlers(targetId: string): void {
    this.actionHandlers.delete(targetId);
    this.targetDomainMap.delete(targetId);
    this.catchAllHandlers.delete(targetId);
    this.pendingActions.delete(targetId);
    this.retiredTargets.delete(targetId);
  }

  /**
   * Register a catch-all handler for a target.
   * The catch-all handler is invoked for any action type when no specific handler
   * is registered for the (targetId, actionTypeId) pair.
   *
   * This is an INTERNAL method used exclusively for child domain forwarding via
   * bridge transport — the parent mediator cannot know the child's action types
   * at registration time, so the forwarding handler must intercept any action type.
   *
   * @param targetId - ID of the target
   * @param handler - Handler to invoke for any unmatched action type
   */
  registerCatchAllHandler(targetId: string, handler: ActionHandler): void {
    this.catchAllHandlers.set(targetId, handler);
  }

  /**
   * Register the catch-all tier for a target with a `CrossHopRoute` rather
   * than a plain `ActionHandler` — the shape every runtime-crossing hop must
   * resolve to (`cpt-frontx-adr-action-dispatch-and-chaining`). Used
   * exclusively for the converted parent-to-child-domain forwarding tier
   * (`ChildDomainForwardingHandler`).
   *
   * @internal
   */
  registerCatchAllRoute(targetId: string, route: CrossHopRoute): void {
    this.catchAllHandlers.set(targetId, route);
  }

  /**
   * Unregister a catch-all handler for a target.
   *
   * @param targetId - ID of the target
   */
  unregisterCatchAllHandler(targetId: string): void {
    this.catchAllHandlers.delete(targetId);
  }

  /**
   * Signal that the registry whose executor this mediator IS has been
   * disposed. Called exactly once, from `DefaultMfeRegistry.dispose()`, as
   * the executor-lifetime boundary `cpt-frontx-adr-action-dispatch-and-chaining`
   * states: never an outcome of any action, but the reason no attempt this
   * executor still holds may select one after this call returns.
   *
   * Marking `disposed` is the durable half of what this call does: every
   * reservation this executor holds is released exactly where it already
   * is, inside `executeLocalNode`'s own `finally` (or the guarded
   * acceptance-reservation release `acceptSingleNodeForHop` installs) — but
   * this call is also what makes that release happen PROMPTLY rather than
   * only whenever the node's own handler eventually settles: every callback
   * registered in `teardownCallbacks` at this instant — one per attempt
   * currently in flight, however many — is invoked here, in the same
   * synchronous turn, which is what ends every attempt this executor
   * currently holds "at once" without waiting for any of their handlers. A
   * settlement observed post-disposal selects neither `next` nor
   * `fallback`, records no chain-failure diagnostic, and starts no node
   * (`inst-executor-teardown-ends`). A second call is a no-op: `disposed`
   * can only ever be set once, and `teardownCallbacks` is already empty by
   * then regardless.
   *
   * @internal
   */
  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-executor-teardown-ends
  // @cpt-begin:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-t-executor-teardown-ends
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    // Snapshot the callbacks currently registered and clear the set BEFORE
    // invoking any of them: invoking one may synchronously run an attempt's
    // own `finally` (removing its own entry, harmlessly, from an
    // already-cleared set), and this call itself must never be re-entered by
    // one of those callbacks — `disposed` is already `true` above regardless.
    const callbacks = [...this.teardownCallbacks];
    this.teardownCallbacks.clear();
    for (const callback of callbacks) {
      callback();
    }
  }
  // @cpt-end:cpt-frontx-state-mfe-host-communication-action-lifecycle:p2:inst-t-executor-teardown-ends
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-executor-teardown-ends
}
