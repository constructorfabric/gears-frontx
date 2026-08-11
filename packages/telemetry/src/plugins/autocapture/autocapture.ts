import { getEventTarget, isSensitiveElement, isTextNode } from '../../utils/dom';
import type { TelemetryData } from '../../utils/eventTypes';
import type { TelemetryPlugin, TelemetryPluginContext } from '../../utils/types';
import type { TelemetryElementHookResult } from './elementHook';
import type { AutocaptureElementContribution } from './helpers';
import {
  attributeIgnoreList,
  autocaptureElements,
  convertToURL,
  eachParentElement,
  getElementHook,
  getTextContent,
  limitText,
  mergeElementHookContribution,
  noCaptureAttribute,
  shouldCaptureDomEvent,
  shouldCaptureElement,
  shouldCaptureValue,
} from './helpers';

type AutocaptureElementData = {
  data: TelemetryData;
  context: AutocaptureElementContribution['context'];
};

/**
 * Carries an element hook's thrown error out of the ancestor walk without aborting it: the walk
 * degrades that element's contribution and keeps going (same as if the hook had returned
 * nothing), while the error itself is stashed here for `captureEvent` to translate into a
 * `CaptureEventResult` once the walk completes. Modeled as an optional wrapper — rather than a
 * bare `value` alongside a boolean flag — so presence of `current`, not truthiness of `value`, is
 * the signal: a hook may throw a falsy value (`0`, `''`, `false`, `NaN`) or `null`, and a
 * truthiness check on `value` alone would silently drop those instead of surfacing them. Internal
 * to the walk only; callers of `captureEvent` see `CaptureEventResult` instead.
 */
type HookErrorRef = { current?: { value: unknown } };

/**
 * `captureEvent`'s return to its caller (`handler`). The walk's internal `HookErrorRef` plumbing
 * stays internal — this is the boundary type, translated from the ref once the walk is done. Same
 * optional-wrapper reasoning as `HookErrorRef`: presence of `hookError`, not truthiness of its
 * `value`, is what tells `handler` a hook threw (a hook may throw a falsy value or `null`).
 */
type CaptureEventResult = { hookError?: { value: unknown } };

// @cpt-flow:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1
// @cpt-algo:cpt-frontx-telemetry-algo-dom-autocapture-listener-install:p2
// @cpt-algo:cpt-frontx-telemetry-algo-dom-autocapture-capture-event:p1
// @cpt-algo:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1
// @cpt-algo:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1
// @cpt-algo:cpt-frontx-telemetry-algo-dom-autocapture-collect-attributes:p1
// @cpt-state:cpt-frontx-telemetry-state-dom-autocapture-decision:p2
// @cpt-dod:cpt-frontx-telemetry-dod-dom-autocapture-listeners:p1
// @cpt-dod:cpt-frontx-telemetry-dod-dom-autocapture-capture:p1
// @cpt-dod:cpt-frontx-telemetry-dod-dom-autocapture-opt-out:p1
// @cpt-dod:cpt-frontx-telemetry-dod-dom-autocapture-redaction:p1
// @cpt-dod:cpt-frontx-telemetry-dod-dom-autocapture-contribution:p1
// @cpt-dod:cpt-frontx-telemetry-dod-dom-autocapture-hook-errors:p1
// @cpt-dod:cpt-frontx-telemetry-dod-dom-autocapture-veto:p1
export function autocapturePlugin(): TelemetryPlugin {
  return {
    name: 'autocapture',
    setup: (context: TelemetryPluginContext) => {
      // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-listener-install:p2:inst-check-autocapture-enabled
      const autocaptureConfig = context.config.autocapture;

      if (!autocaptureConfig) {
        // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-listener-install:p2:inst-return-disabled
        return;
        // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-listener-install:p2:inst-return-disabled
      }
      // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-listener-install:p2:inst-check-autocapture-enabled

      // removeEventListener only matches a listener whose capture flag matches, so the same
      // options object has to be used on the way out. `passive` is not part of that match.
      const listenerOptions = { capture: true } as const;

      // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-listener-install:p2:inst-install-listeners
      document.addEventListener('submit', handler, { ...listenerOptions, passive: true });
      document.addEventListener('change', handler, { ...listenerOptions, passive: true });
      document.addEventListener('click', handler, { ...listenerOptions, passive: true });
      // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-listener-install:p2:inst-install-listeners

      // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-listener-install:p2:inst-register-removal
      context.addHook('destroy', () => {
        document.removeEventListener('submit', handler, listenerOptions);
        document.removeEventListener('change', handler, listenerOptions);
        document.removeEventListener('click', handler, listenerOptions);
      });
      // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-listener-install:p2:inst-register-removal

      // @cpt-begin:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-receive-event
      function handler(e: Event) {
        // Genuine internal autocapture errors (a bug in the walk itself, not a consumer hook) are
        // not caught here: they propagate straight out of this listener callback to
        // window.onerror / error monitoring, same as the hook-error throw below. Autocapture never
        // swallows an error.
        const result = captureEvent(e || window?.event);

        // @cpt-begin:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-check-hook-error
        if (result.hookError) {
          // The base event has already been emitted (captureEvent returns only after that). This
          // is the consumer's hook error escaping the document-listener callback on purpose, so it
          // still reaches window.onerror / error monitoring with a real stack instead of being
          // silently swallowed. A hook is untrusted code, so it may have thrown a non-Error value
          // (including a falsy one, or `null`) — wrapped here with `cause` set to the original so
          // error monitoring still attributes it to the consumer's element hook, not to this
          // handler.
          // @cpt-begin:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-rethrow-hook-error
          if (result.hookError.value instanceof Error) {
            throw result.hookError.value;
          }
          // `cause` is defined rather than passed to the constructor: the ecosystem-wide
          // type-check runs at `lib: ES2020`, where `ErrorOptions` does not exist.
          const wrapped = new Error('Telemetry element hook threw a non-Error value');
          Object.defineProperty(wrapped, 'cause', {
            value: result.hookError.value,
            configurable: true,
            writable: true,
          });
          throw wrapped;
          // @cpt-end:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-rethrow-hook-error
        }
        // @cpt-end:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-check-hook-error
      }
      // @cpt-end:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-receive-event

      function captureEvent(e: Event): CaptureEventResult {
        /** * Don't mess with this code without running IE8 tests on it ***/
        // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-capture-event:p1:inst-get-target
        // @cpt-begin:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-resolve-target
        let target = getEventTarget(e);
        // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-capture-event:p1:inst-get-target
        // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-capture-event:p1:inst-normalize-text-node
        if (isTextNode(target)) {
          // Safari bug (see: http://www.quirksmode.org/js/events_properties.html)
          target = (target.parentNode ?? null) as Element | null;
        }
        // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-capture-event:p1:inst-normalize-text-node
        // @cpt-end:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-resolve-target

        // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-capture-event:p1:inst-guard-capturable
        // @cpt-begin:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-check-capturable
        // @cpt-begin:cpt-frontx-telemetry-state-dom-autocapture-decision:p2:inst-received-to-abandoned
        if (!target || !shouldCaptureDomEvent(target, e)) {
          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-capture-event:p1:inst-return-no-capture
          // @cpt-begin:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-return-not-capturable
          return {};
          // @cpt-end:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-return-not-capturable
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-capture-event:p1:inst-return-no-capture
        }
        // @cpt-end:cpt-frontx-telemetry-state-dom-autocapture-decision:p2:inst-received-to-abandoned
        // @cpt-end:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-check-capturable
        // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-capture-event:p1:inst-guard-capturable

        // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-capture-event:p1:inst-run-walk
        // @cpt-begin:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-walk-ancestors
        // @cpt-begin:cpt-frontx-telemetry-state-dom-autocapture-decision:p2:inst-received-to-walking
        const hookErrorRef: HookErrorRef = {};
        const captured = getDataForAutocaptureElement(target, e, hookErrorRef);
        // @cpt-end:cpt-frontx-telemetry-state-dom-autocapture-decision:p2:inst-received-to-walking
        // @cpt-end:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-walk-ancestors
        // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-capture-event:p1:inst-run-walk

        // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-capture-event:p1:inst-check-walk-result
        // @cpt-begin:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-check-suppression
        // @cpt-begin:cpt-frontx-telemetry-state-dom-autocapture-decision:p2:inst-walking-to-emitted
        if (captured !== false) {
          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-capture-event:p1:inst-log-captured-event
          // @cpt-begin:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-emit-event
          context.logEvent({
            name: `autocapture_${e.type}`,
            data: captured.data,
            ...captured.context,
          });
          // @cpt-end:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-emit-event
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-capture-event:p1:inst-log-captured-event
        }
        // @cpt-end:cpt-frontx-telemetry-state-dom-autocapture-decision:p2:inst-walking-to-emitted
        // @cpt-end:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-check-suppression
        // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-capture-event:p1:inst-check-walk-result

        // Also the suppressed path's exit: when the walk returned false nothing was emitted above,
        // and control reaches this same return.
        // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-capture-event:p1:inst-return-hook-error
        // @cpt-begin:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-return-suppressed
        return hookErrorRef.current ? { hookError: hookErrorRef.current } : {};
        // @cpt-end:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-return-suppressed
        // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-capture-event:p1:inst-return-hook-error
      }

      function getDataForAutocaptureElement(
        target: Element,
        e: Event,
        hookErrorRef: HookErrorRef,
      ): AutocaptureElementData | false {
        let result: TelemetryData | undefined = undefined;
        let href: string | undefined;
        let contribution: AutocaptureElementContribution = { context: {}, data: {} };

        // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-each-ancestor
        // @cpt-begin:cpt-frontx-telemetry-state-dom-autocapture-decision:p2:inst-walking-to-abandoned
        for (const el of eachParentElement(target, true)) {
          // Presence only — the value is never read, so the bare attribute and any value at all
          // all opt out.
          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-check-opt-out
          if (el.hasAttribute(noCaptureAttribute)) {
            // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-abandon-opt-out
            return false;
            // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-abandon-opt-out
          }
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-check-opt-out

          // A sensitive element anywhere on the path drops the whole event, not just its fields.
          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-check-element-capturable
          if (!shouldCaptureElement(el)) {
            // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-abandon-not-capturable
            return false;
            // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-abandon-not-capturable
          }
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-check-element-capturable

          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-apply-hook
          const appliedContribution = applyElementHook(el, contribution, hookErrorRef);
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-apply-hook
          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-check-veto
          if (appliedContribution === false) {
            // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-abandon-veto
            return false;
            // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-abandon-veto
          }
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-check-veto
          contribution = appliedContribution;

          const tagName = el.tagName.toLowerCase();

          // if the element or a parent element is an anchor tag
          // include the href as a property
          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-remember-anchor-target
          if (tagName === 'a') {
            const value = el.getAttribute('href');
            if (value !== null && shouldCaptureValue(value)) {
              href = value;
            }
          }
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-remember-anchor-target

          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-collect-element-fields
          const currentElData: TelemetryData = {
            $el_tag_name: tagName,
            ...getAttributesFromElement(el),
          };
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-collect-element-fields

          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-collect-text
          const text = getTextContent(el);
          if (text) {
            currentElData.$el_text = limitText(text);
          }
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-collect-text

          // TODO: maybe we should send smth from parent elements as well
          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-adopt-result
          if (autocaptureElements.includes(tagName)) {
            result ??= currentElData;
          }
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-adopt-result
        }
        // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-each-ancestor

        // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-check-no-result
        if (!result) {
          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-abandon-no-result
          return false;
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-abandon-no-result
        }
        // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-check-no-result

        // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-check-anchor
        if (href) {
          result.$el_attr_href = href;
          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-mark-external
          const hrefHost = convertToURL(href)?.host;
          const locationHost = window?.location?.host;
          if (hrefHost && locationHost && hrefHost !== locationHost && e.type === 'click') {
            result.$external_click_url = href;
          }
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-mark-external
        }
        // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-check-anchor

        // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-check-empty-result
        if (Object.keys(result).length === 0) {
          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-abandon-empty
          return false;
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-abandon-empty
        }
        // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-check-empty-result
        // @cpt-end:cpt-frontx-telemetry-state-dom-autocapture-decision:p2:inst-walking-to-abandoned

        // Autocapture's own $el_*/$external_* keys are spread last so they always win over any
        // hook-contributed custom data of the same name.
        // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-merge-own-last
        // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-return-walk-result
        // @cpt-begin:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-merge-contribution
        return { data: { ...contribution.data, ...result }, context: contribution.context };
        // @cpt-end:cpt-frontx-telemetry-flow-dom-autocapture-attribute:p1:inst-merge-contribution
        // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-return-walk-result
        // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-ancestor-walk:p1:inst-merge-own-last
      }

      function applyElementHook(
        el: Element,
        contribution: AutocaptureElementContribution,
        hookErrorRef: HookErrorRef,
      ): AutocaptureElementContribution | false {
        // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-read-hook
        const hook = getElementHook(el);
        // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-read-hook
        // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-check-hook-present
        if (!hook) {
          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-return-unchanged
          return contribution;
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-return-unchanged
        }
        // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-check-hook-present

        let result: TelemetryElementHookResult;
        // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-invoke-hook
        try {
          result = hook();
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-invoke-hook
          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-catch-hook-throw
        } catch (error: unknown) {
          // An element hook is untrusted code we don't control (attached by whatever element
          // registered it): let it fail this element's contribution only, never the whole
          // autocapture event (base data included) that the rest of this walk is still building
          // up. The error itself isn't dropped though — it's stashed for `handler` to re-throw
          // after the event has been emitted (see `handler` above). Only the first thrown value
          // for this event is kept — `??=` only assigns when `current` is still `undefined`, so a
          // farther-out hook's later throw never replaces it. This is safe to gate on the wrapper
          // object rather than the thrown value's truthiness: `current` itself is always a truthy
          // `{ value }` once set, even when `value` is falsy or `null`.
          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-stash-first-failure
          hookErrorRef.current ??= { value: error };
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-stash-first-failure
          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-degrade-element
          return contribution;
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-degrade-element
        }
        // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-catch-hook-throw

        // Processing the hook's result is autocapture's own code, not the untrusted call — it
        // stays outside the try so a bug here surfaces as a genuine internal error that propagates
        // straight out of `handler` (see above), never misattributed as a hook error.
        // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-check-empty-result-hook
        if (!result) {
          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-return-no-contribution
          return contribution;
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-return-no-contribution
        }
        // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-check-empty-result-hook

        // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-check-hook-veto
        if (result.capture === false) {
          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-return-veto
          return false;
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-return-veto
        }
        // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-check-hook-veto

        // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-merge-outside-try
        return mergeElementHookContribution(contribution, result);
        // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-apply-element-hook:p1:inst-merge-outside-try
      }

      function getAttributesFromElement(elem: Element): TelemetryData {
        const result: TelemetryData = {};

        // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-collect-attributes:p1:inst-each-attribute
        for (const attr of elem.attributes) {
          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-collect-attributes:p1:inst-skip-ignored
          if (attributeIgnoreList.includes(attr.name)) {
            continue;
          }
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-collect-attributes:p1:inst-skip-ignored

          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-collect-attributes:p1:inst-record-class-list
          if (attr.name === 'class') {
            const classes = elem.classList.toString();

            if (classes) {
              result.$el_attr_class = classes;
            }

            continue;
          }
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-collect-attributes:p1:inst-record-class-list

          // Only capture attributes we know are safe
          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-collect-attributes:p1:inst-restrict-sensitive
          if (isSensitiveElement(elem) && !['name', 'id', 'aria-label'].includes(attr.name)) {
            continue;
          }
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-collect-attributes:p1:inst-restrict-sensitive

          // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-collect-attributes:p1:inst-record-safe-value
          if (shouldCaptureValue(attr.value)) {
            result[`$el_attr_${attr.name}`] = limitText(attr.value);
          }
          // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-collect-attributes:p1:inst-record-safe-value
        }
        // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-collect-attributes:p1:inst-each-attribute

        // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-collect-attributes:p1:inst-return-attributes
        return result;
        // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-collect-attributes:p1:inst-return-attributes
      }
    },
  };
}
