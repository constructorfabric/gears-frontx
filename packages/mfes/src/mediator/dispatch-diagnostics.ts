/**
 * Dispatch-diagnostics origin tagging and correlation-identity issuance.
 *
 * Realizes the carrying half of `inst-diagnostic-record`
 * (`mfe-host-communication/FEATURE.md`): a structured diagnostic for a
 * refusal or a node failure must carry "a correlation identity for the
 * dispatch, and, where the dispatch carried them, the originating lifecycle
 * stage and extension". Two distinct pieces of context travel through the
 * executor's own recursion (and, when a chain crosses a hop, through the
 * `CrossHopEnvelope.diagnostics` field that carries this across a hop):
 *
 *  - A correlation identity, minted once per accepted root chain (or once
 *    per cross-hop single-node execution that received none), so every
 *    diagnostic produced while executing that one dispatch — however many
 *    nodes or hops it traverses — can be told apart from every other
 *    dispatch's diagnostics.
 *  - An optional origin (lifecycle stage id + entity kind/id), tagged onto
 *    the dispatched chain's root `Action` object BEFORE it is handed to
 *    `executeActionsChain`, by whichever caller has that context —
 *    currently only `DefaultLifecycleManager`, for a lifecycle-hook-
 *    triggered chain. A chain dispatched by ordinary application code
 *    carries no such tag, and the origin fields are simply absent from its
 *    diagnostics, exactly as the instruction's "where the dispatch carried
 *    them" anticipates.
 *
 * Tagging is by object identity via a module-scoped `WeakMap`, the same
 * pattern `inbound-bridge-link.ts` uses for arrival-edge tagging
 * (`tagArrivalEdge`/`getArrivalEdge`): both the write (here, from
 * `DefaultLifecycleManager`, inside this copy of the package) and the read
 * (from `DefaultActionsChainsMediator.runAcceptedChain`, in the SAME
 * registry's own mediator) execute inside one copy of this module, so a
 * module-scoped `WeakMap` is correct here — unlike the mounting-bridge
 * rendezvous, this state never needs to be read from a different copy than
 * the one that wrote it. No field is added to the public `Action`/
 * `ActionsChain` GTS-backed contracts (`packages/mfes/src/types/index.ts`)
 * to carry this: it stays purely on this internal side channel.
 *
 * @packageDocumentation
 * @internal
 */

import type { Action, ActionsChain } from '../types';
import { ActionsChainRefusalError } from '../errors';
import type { MfeDiagnosticSink } from '../runtime/config';

/**
 * The lifecycle-triggering context a dispatch may have been tagged with:
 * which stage, on which entity, triggered the chain this diagnostic
 * attributes.
 */
export interface DispatchOriginContext {
  readonly entityKind: 'extension' | 'domain';
  readonly entityId: string;
  readonly stageId: string;
}

/**
 * The full diagnostic-attribution context threaded through one accepted
 * chain's own recursion (and, across a hop, through the cross-hop
 * envelope): a correlation identity every diagnostic from this dispatch
 * carries, and an optional origin.
 */
export interface DiagnosticContext {
  readonly correlationId: string;
  readonly origin?: DispatchOriginContext;
  /**
   * The accumulated execution path of a SENDING executor, up to (but never
   * including) the node currently crossing the hop — carried across the
   * cross-hop envelope's `diagnostics` field alongside `correlationId`/
   * `origin` so a structured diagnostic reported at the RECEIVING end of
   * the hop (`acceptSingleNodeForHop`, which mints the receiving side's
   * execution state before accepting) can seed its own local path with it
   * rather than starting fresh: without this, a node several hops deep
   * would report a path naming only itself, understating how far the
   * failing chain actually reached. Absent for a dispatch that never
   * crossed a hop (the ordinary, same-registry case) and for a context
   * reconstructed from an envelope that carried no recognizable
   * `senderPath` (see `fromEnvelopeDiagnostics`).
   */
  readonly senderPath?: readonly string[];
}

const originByAction = new WeakMap<Action, DispatchOriginContext>();

/**
 * Tag a chain's root action with the lifecycle stage/entity that is about
 * to dispatch it, BEFORE handing the chain to `executeActionsChain`. Called
 * only by a caller that itself has this context (today, exclusively
 * `DefaultLifecycleManager`).
 */
export function tagDispatchOrigin(action: Action, origin: DispatchOriginContext): void {
  originByAction.set(action, origin);
}

/**
 * Read back the origin tagged onto a chain's root action, if any. Ordinary
 * (non-lifecycle-triggered) dispatches were never tagged, so this returns
 * `undefined` for them — the diagnostic simply omits the origin fields, per
 * "where the dispatch carried them".
 */
export function getDispatchOrigin(action: Action): DispatchOriginContext | undefined {
  return originByAction.get(action);
}

/**
 * Monotonic per-process counter backing `nextDispatchCorrelationId`.
 * Deliberately distinct from `DefaultLifecycleManager`'s own
 * `correlationSeq` (which correlates a REFUSAL to its triggering hook
 * call): this one correlates every diagnostic produced by ONE accepted
 * chain's execution, refusal or node failure alike, across however many
 * nodes and hops that execution touches.
 */
let correlationSeq = 0;
export function nextDispatchCorrelationId(): string {
  correlationSeq += 1;
  return `dispatch-${correlationSeq}`;
}

/**
 * Serialize a `DiagnosticContext` into the shape `CrossHopEnvelope.diagnostics`
 * carries across a hop — a plain, substitutable-transport-safe record, never
 * interpreted by the transport itself, only by the receiving mediator via
 * `fromEnvelopeDiagnostics` below. Reuses the same `CrossHopEnvelope.diagnostics` channel
 * on the envelope rather than adding a second one.
 *
 * @param currentPath - The sending executor's own accumulated path so far
 *   (never including the node currently crossing the hop), carried as
 *   `senderPath` so the receiving end's own structured diagnostic, should
 *   this node fail there, names the full path leading to it rather than a
 *   disconnected single entry. Added inside this already-present
 *   `diagnostics` record — never a change to `CrossHopEnvelope`'s own shape
 *   (`action`/`version`/`diagnostics`), so it carries no version
 *   implication of its own (see this function's call site for the full
 *   version-increment reasoning).
 */
export function toEnvelopeDiagnostics(
  context: DiagnosticContext,
  currentPath: readonly string[]
): Readonly<Record<string, unknown>> {
  return {
    correlationId: context.correlationId,
    senderPath: [...currentPath],
    ...(context.origin
      ? {
          originEntityKind: context.origin.entityKind,
          originEntityId: context.origin.entityId,
          originStageId: context.origin.stageId,
        }
      : {}),
  };
}

/**
 * Reconstruct a `DiagnosticContext` from a received `CrossHopEnvelope`'s
 * `diagnostics` field, so a node failure at the RECEIVING end of a hop
 * still carries the correlation identity (and, where present, the origin)
 * of the dispatch that crossed into it — the same dispatch, several hops
 * away from wherever it started. Returns `undefined` if the record does
 * not carry a recognizable shape (e.g. an envelope produced by a copy of
 * this package that predates this field's use, or a malformed record),
 * in which case the receiving mediator mints its own fresh correlation
 * identity rather than failing the hop over a diagnostics-only gap.
 */
export function fromEnvelopeDiagnostics(
  record: Readonly<Record<string, unknown>>
): DiagnosticContext | undefined {
  const { correlationId, originEntityKind, originEntityId, originStageId, senderPath } = record;
  if (typeof correlationId !== 'string') {
    return undefined;
  }
  const origin: DispatchOriginContext | undefined =
    (originEntityKind === 'extension' || originEntityKind === 'domain') &&
    typeof originEntityId === 'string' &&
    typeof originStageId === 'string'
      ? { entityKind: originEntityKind, entityId: originEntityId, stageId: originStageId }
      : undefined;
  // Tolerant, feature-detected, exactly like `origin` above: an envelope
  // produced by a copy of this package that predates `senderPath`'s use (or
  // one carrying a malformed value) simply yields no seeded prefix — the
  // receiving end's local path starts empty, exactly as it always has.
  const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((entry) => typeof entry === 'string');
  return {
    correlationId,
    origin,
    ...(isStringArray(senderPath) ? { senderPath } : {}),
  };
}

/**
 * Invoke a `MfeDiagnosticSink` method through a containment boundary: a
 * host-supplied sink is untrusted control-flow-wise, so a throw from it must
 * never propagate into the runtime path that triggered the report (a
 * chain's own fallback selection, or a lifecycle transition), which is
 * exactly what an uncontained sink call would do
 * (`cpt-frontx-adr-action-dispatch-and-chaining` / `inst-diagnostic-record`'s
 * containment). Deliberately NOT silent: the sink's own failure is still
 * surfaced via `console.error`, on the reasoning that swallowing a broken
 * sink completely would hide a real host-side defect from whoever is
 * watching the console, while still never letting it change what the
 * runtime itself does next.
 *
 * @param invoke - The sink call to perform, already bound with its own
 *   diagnostic payload.
 * @param description - Short, human-readable description of what was being
 *   reported, used only in the `console.error` fallback message.
 */
export function invokeDiagnosticSinkSafely(invoke: () => void, description: string): void {
  try {
    invoke();
  } catch (sinkError) {
    console.error(
      `[MfeDiagnosticSink] threw while ${description}; the throw is contained here so a ` +
        'broken host-supplied sink cannot alter runtime control flow (still logged for visibility).',
      sinkError
    );
  }
}

/**
 * Report a chain's synchronous REFUSAL (`ActionsChainRefusalError`) through
 * the substitutable diagnostic sink, reusing the SAME structured shape
 * (`ChainNodeFailureDiagnostic`, via `reportChainNodeFailure`) a node
 * failure is reported through, and the SAME refusal classification the
 * envelope validator / registry already raise — never a parallel taxonomy
 * (`inst-diagnostic-record`: "for a refusal and for every node failure
 * alike"). A no-op for any other thrown value: only an
 * `ActionsChainRefusalError` is a refusal in this runtime's own vocabulary.
 *
 * Also a no-op when the chain's root action carries a dispatch-origin tag
 * (`getDispatchOrigin`): today the ONLY caller that tags one is
 * `DefaultLifecycleManager`, immediately before it dispatches a lifecycle
 * hook through this very same acceptance surface — and it ALREADY
 * synchronously catches and reports every one of that hook's own refusals,
 * through `reportLifecycleDispatchRefusal`'s own, richer shape (carrying
 * `hookPosition`/`stageId`, which this generic call site does not have).
 * Reporting here too would double-report the identical refusal under two
 * different diagnostic shapes; deferring to the tagged caller's own report
 * is what keeps this a single, coherent attribution per refusal rather than
 * two disagreeing ones.
 *
 * Called BEFORE the refusal is rethrown to the caller — the throw itself,
 * the contract with the emitter, is unchanged by this call.
 *
 * @param sink - The diagnostic sink to report through.
 * @param chain - The refused chain (its root action's target/type name the
 *   refusal; no node ever executed, so `path` is empty).
 * @param error - The value caught at the refusal site; ignored unless it is
 *   an `ActionsChainRefusalError`.
 */
export function reportSynchronousChainRefusal(
  sink: MfeDiagnosticSink,
  chain: ActionsChain,
  error: unknown
): void {
  if (!(error instanceof ActionsChainRefusalError)) {
    return;
  }
  const origin = getDispatchOrigin(chain.action);
  if (origin) {
    return;
  }
  // No origin fields here: this branch is reached only for an UN-tagged
  // dispatch (the check above already returned for a tagged one), so there
  // is never an origin to carry, exactly like an ordinary (non-lifecycle)
  // node failure's own diagnostic.
  invokeDiagnosticSinkSafely(
    () =>
      sink.reportChainNodeFailure({
        classification: 'chain-node-failure',
        path: [],
        target: chain.action.target,
        failureClass: error.refusalClass,
        correlationId: nextDispatchCorrelationId(),
      }),
    'reporting a chain refusal'
  );
}
