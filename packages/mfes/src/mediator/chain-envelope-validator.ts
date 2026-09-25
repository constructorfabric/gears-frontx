/**
 * Actions Chain Envelope Validator
 *
 * Structural validation of a chain envelope handed to `executeActionsChain`,
 * owned by the runtime rather than the injected type-system provider — the
 * provider admits individual actions and never the chain envelope itself
 * (`inst-validate-envelope`). This module is deliberately separate from
 * `DefaultActionsChainsMediator`: the mediator owns *execution* of an
 * already-accepted chain, while this validator owns *acceptance*, which per
 * ADR `cpt-frontx-adr-action-dispatch-and-chaining` is a synchronous refusal
 * decision made before any execution state exists — structural shape,
 * cycle detection, and per-action declared-timeout validation, applied once
 * to the envelope as a whole, before a single node runs. There is no
 * whole-chain budget: ADR-0007 places no aggregate bound on a chain, so
 * bounding is validated per action and nowhere else.
 *
 * @packageDocumentation
 */

import { ActionsChainRefusalError } from '../errors';
import type { ActionsChain } from '../types';

/** Largest bound the executor can promise to enforce as declared — the
 * upper limit of the signed 32-bit millisecond range a platform timer
 * schedules as written (ADR `cpt-frontx-adr-action-dispatch-and-chaining`). */
export const MAX_DECLARED_TIMEOUT_MS = 2147483647;

/** A step in the traversal's explicit (heap-allocated) work stack. Kept
 * iterative — never recursive — so a deeply nested but acyclic chain cannot
 * overflow the call stack. */
interface StackFrame {
  node: unknown;
  /**
   * The edge taken from this frame's parent to reach it, or `undefined` for
   * the dispatched root. Used only to know whether `leave` must pop the
   * shared `path` array — the path itself is one mutable array shared by
   * the whole traversal (pushed/popped in lockstep with the stack) rather
   * than a fresh copy per frame, so memory stays linear in chain depth
   * instead of quadratic.
   */
  edge?: 'next' | 'fallback';
  /** Which part of this node's own validation/descent remains to run. */
  phase: 'enter' | 'descend-next' | 'descend-fallback' | 'leave';
}

function describeNode(path: ReadonlyArray<'next' | 'fallback'>): string {
  return path.length === 0 ? 'the dispatched root' : `node at path '${path.join('.')}'`;
}

/**
 * True when `value` is a positive, finite integer no greater than
 * `MAX_DECLARED_TIMEOUT_MS` — the one valid shape for a declared per-action
 * timeout, and for an authoritative domain's default absent one (ADR
 * `cpt-frontx-adr-action-dispatch-and-chaining`).
 */
export function isValidDeclaredTimeout(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_DECLARED_TIMEOUT_MS
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate one node's own shape: its `action` object and string `target`,
 * and its own declared `Action.timeout` value. Does NOT recurse — the
 * caller's iterative traversal is what walks `next`/`fallback`.
 */
// @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-validate-envelope
function validateNodeShape(node: unknown, path: ReadonlyArray<'next' | 'fallback'>): void {
  if (!isPlainRecord(node)) {
    throw new ActionsChainRefusalError(
      'malformed_continuation',
      [...path],
      `Actions chain is malformed: ${describeNode(path)} is not a chain object`
    );
  }

  const action = node['action'];
  if (!isPlainRecord(action)) {
    throw new ActionsChainRefusalError(
      'malformed_action',
      [...path],
      `Actions chain is malformed: ${describeNode(path)} carries a missing or non-object 'action'`
    );
  }

  if (typeof action['target'] !== 'string') {
    throw new ActionsChainRefusalError(
      'malformed_action',
      [...path],
      `Actions chain is malformed: ${describeNode(path)} carries an 'action' with a missing or non-string 'target'`
    );
  }

  const next = node['next'];
  if (next !== undefined && !isPlainRecord(next)) {
    throw new ActionsChainRefusalError(
      'malformed_continuation',
      [...path],
      `Actions chain is malformed: 'next' of ${describeNode(path)} is present but not a conforming chain object`
    );
  }

  const fallback = node['fallback'];
  if (fallback !== undefined && !isPlainRecord(fallback)) {
    throw new ActionsChainRefusalError(
      'malformed_continuation',
      [...path],
      `Actions chain is malformed: 'fallback' of ${describeNode(path)} is present but not a conforming chain object`
    );
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-validate-envelope

  // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-validate-action-timeout
  // The only declared bound this validator checks: a per-action timeout,
  // against the same numeric rule (`isValidDeclaredTimeout`) applied
  // wherever a declared timeout is validated. There is no whole-chain
  // budget to validate against (ADR `cpt-frontx-adr-action-dispatch-and-chaining`).
  const actionTimeout = action['timeout'];
  if (actionTimeout !== undefined && !isValidDeclaredTimeout(actionTimeout)) {
    throw new ActionsChainRefusalError(
      'invalid_action_timeout',
      [...path],
      `Actions chain is malformed: the declared 'timeout' of the action at ${describeNode(
        path
      )} must be a positive, finite integer count of milliseconds no greater than ${MAX_DECLARED_TIMEOUT_MS}`
    );
  }
  // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-validate-action-timeout
}

/**
 * Validate a chain envelope before any execution is accepted for it.
 *
 * Detects, as refusals (never as chain/node failures):
 * - a missing or non-object `action`, or a missing or non-string `action.target`
 * - a malformed `next` or `fallback` (present but not a conforming chain object)
 * - a cycle in the `next`/`fallback` graph
 * - a declared `Action.timeout` that is not a positive, finite integer no
 *   greater than {@link MAX_DECLARED_TIMEOUT_MS}
 *
 * Traversal is iterative (an explicit work stack, never recursion), so a
 * deeply nested but acyclic chain cannot overflow the call stack. Cycle
 * detection uses an active-path set — populated on entering a node and
 * cleared once that node's whole subtree (`next` AND `fallback`) has been
 * validated — rather than a global seen-set, because the same continuation
 * object may legitimately be shared by two branches of the chain; that is
 * not a cycle, and a global seen-set would reject it wrongly.
 *
 * @param root - The chain envelope handed to the dispatch call. Untyped as
 *   `unknown` deliberately: this is the runtime's own defense against a
 *   structurally malformed envelope, which by definition need not conform
 *   to the `ActionsChain` shape the type system describes.
 * @throws {ActionsChainRefusalError} naming the offending node and the rule it violated.
 */
export function validateChainEnvelope(root: unknown): asserts root is ActionsChain {
  const activePath = new Set<unknown>();
  // Shared, mutated in lockstep with the stack (pushed on descent, popped on
  // leave) rather than copied per frame, so memory stays O(depth) instead of
  // O(depth^2) for a long linear chain. A frozen snapshot is taken only when
  // a refusal is actually thrown, which is the rare path.
  const path: Array<'next' | 'fallback'> = [];
  const stack: StackFrame[] = [{ node: root, phase: 'enter' }];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];

    switch (frame.phase) {
      case 'enter': {
        // @cpt-begin:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-validate-envelope
        if (activePath.has(frame.node)) {
          throw new ActionsChainRefusalError(
            'cyclic_chain',
            [...path],
            `Actions chain is malformed: a cycle was detected reaching ${describeNode(path)} again along its own active path`
          );
        }
        // @cpt-end:cpt-frontx-algo-mfe-host-communication-mediator-dispatch:p1:inst-validate-envelope

        validateNodeShape(frame.node, path);
        activePath.add(frame.node);
        frame.phase = 'descend-next';
        break;
      }

      case 'descend-next': {
        frame.phase = 'descend-fallback';
        const next = (frame.node as Record<string, unknown>)['next'];
        if (next !== undefined) {
          path.push('next');
          stack.push({ node: next, edge: 'next', phase: 'enter' });
        }
        break;
      }

      case 'descend-fallback': {
        frame.phase = 'leave';
        const fallback = (frame.node as Record<string, unknown>)['fallback'];
        if (fallback !== undefined) {
          path.push('fallback');
          stack.push({ node: fallback, edge: 'fallback', phase: 'enter' });
        }
        break;
      }

      case 'leave': {
        activePath.delete(frame.node);
        stack.pop();
        if (frame.edge !== undefined) {
          path.pop();
        }
        break;
      }
    }
  }
}
