import type { TelemetryEventRecord } from '../../utils/eventTypes';

/**
 * Global-registry key (`Symbol.for`) rather than a module-level `Symbol()`: consumers can load
 * multiple instances of `@gears-frontx/telemetry` on the same page, and a plain `Symbol()` would
 * mint a distinct identity per instance, silently breaking the handshake between autocapture and
 * an element's registered hook.
 */
// @cpt-dod:cpt-frontx-telemetry-dod-dom-autocapture-hook-contract:p1
// @cpt-begin:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-assign-hook
// @cpt-begin:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-user-interacts
export const telemetryElementHookKey: unique symbol = Symbol.for(
  '@gears-frontx/telemetry/element-hook',
);
// @cpt-end:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-user-interacts
// @cpt-end:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-assign-hook

/**
 * The only `TelemetryEventRecord` fields an element hook may set: the attribution fields
 * the SDK honors from a hook. Some fields outside this list are unconditionally overwritten by
 * a built-in plugin before the event reaches the wire regardless of what a hook sets — device,
 * OS, client, and timezone by `device.ts`; `context_app_name`/`context_app_version` by
 * `appInfo.ts` — so a hook setting one of those would be a silent no-op. (`context_language` is a
 * partial exception — `device.ts` only fills it in when unset — but it's still kept off this
 * list.) The allowlist stays this narrow either way: keep it to fields a hook's value actually
 * survives to the sent event.
 */
export const telemetryElementHookAttributionKeys = [
  'context_service_name',
  'context_service_version',
  'context_call_chain',
] as const satisfies readonly (keyof TelemetryEventRecord)[];

export type TelemetryElementHookAttributionKey =
  (typeof telemetryElementHookAttributionKeys)[number];

export type TelemetryElementHookAttribution = Pick<
  TelemetryEventRecord,
  TelemetryElementHookAttributionKey
>;

/**
 * An element hook's return value: the typed attribution fields, plus arbitrary custom data
 * namespaced into the event's `data` bag — mirroring how DOM attributes land (`$el_attr_*`,
 * alongside `$el_tag_name`) rather than flat on the record, so a hook can never collide with a
 * current or future `TelemetryEventRecord` field or have a typo'd field name silently swallowed.
 *
 * `capture: false` takes precedence — when set, any `context`/`data` in the same return is
 * ignored (autocapture checks `capture === false` first and short-circuits before looking at the
 * rest of the return). This is runtime-enforced only, not a compile-time constraint: TypeScript's
 * excess-property check does not fire in the contextual-return position real hooks use (an arrow
 * function assigned to a `TelemetryElementHook`-typed property or variable), so the type system
 * cannot reject a return that sets both `capture: false` and a contribution in the same object.
 */
export type TelemetryElementHookResult = {
  capture?: false;
  context?: Partial<TelemetryElementHookAttribution>;
  data?: Record<string, unknown>;
} | void;

/**
 * A general extension point: any DOM element may register a hook under `telemetryElementHookKey`
 * to govern how autocapture treats events from its subtree. Autocapture's ancestor walk invokes
 * every hook it finds along the clicked element's path (closest/deepest first):
 * - `capture: false` from ANY ancestor's hook short-circuits capture for the whole event — same
 *   effect as the `data-telemetry-no-capture` attribute; the two mechanisms coexist.
 * - A contribution (`context` and/or `data`) is applied atomically per element: the closest hook
 *   that returns a usable contribution wins its whole field-set — both `context` and `data`
 *   together. Autocapture never mixes a `context` from one hook with `data` from another, so a
 *   partial return is "this hook contributed nothing," not fields for a farther-out hook to fill
 *   in.
 * - `data` is merged underneath autocapture's own collected data (`$el_*`, `$external_*`), which
 *   always takes precedence — a hook can add custom keys but never clobber autocapture's own. The
 *   `$` prefix is reserved for autocapture's own keys: a hook's `data` keys must not start with
 *   `$`, so a future autocapture key can never silently shadow a hook-contributed one.
 * - `context_call_chain`, when set, must be the registering element's COMPLETE chain — autocapture
 *   never stitches chains across hooks.
 * - A hook that throws does not drop the event: autocapture degrades that element's contribution
 *   to the shell fallback (as if the hook had returned nothing) so the rest of the walk and the
 *   base event still go through, and the thrown error itself is not swallowed. Only the closest
 *   (first-encountered) throwing hook's error is kept, though — once an error has been captured
 *   for this event, a farther-out hook's error is dropped. The kept error propagates out of
 *   autocapture's document-listener callback after the event has been emitted, so it still reaches
 *   `window.onerror`/error monitoring with a real stack.
 * - This is a cross-package, cross-deployment contract: the reader (autocapture) and writers
 *   (whatever registers a hook) can be on different versions at the same time. Evolve it
 *   additively only — a semantic change to an existing field, or to the suppression/merge
 *   behavior, needs a new `telemetryElementHookKey` registry-symbol string, not a change to what an
 *   existing symbol means.
 */
export type TelemetryElementHook = () => TelemetryElementHookResult;

declare global {
  interface Element {
    [telemetryElementHookKey]?: TelemetryElementHook;
  }
}
