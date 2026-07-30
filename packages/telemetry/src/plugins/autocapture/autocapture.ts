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

export function autocapturePlugin(): TelemetryPlugin {
  return {
    name: 'autocapture',
    setup: (context: TelemetryPluginContext) => {
      const autocaptureConfig = context.config.autocapture;

      if (!autocaptureConfig) {
        return;
      }

      // removeEventListener only matches a listener whose capture flag matches, so the same
      // options object has to be used on the way out. `passive` is not part of that match.
      const listenerOptions = { capture: true } as const;

      document.addEventListener('submit', handler, { ...listenerOptions, passive: true });
      document.addEventListener('change', handler, { ...listenerOptions, passive: true });
      document.addEventListener('click', handler, { ...listenerOptions, passive: true });

      context.addHook('destroy', () => {
        document.removeEventListener('submit', handler, listenerOptions);
        document.removeEventListener('change', handler, listenerOptions);
        document.removeEventListener('click', handler, listenerOptions);
      });

      function handler(e: Event) {
        // Genuine internal autocapture errors (a bug in the walk itself, not a consumer hook) are
        // not caught here: they propagate straight out of this listener callback to
        // window.onerror / error monitoring, same as the hook-error throw below. Autocapture never
        // swallows an error.
        const result = captureEvent(e || window?.event);

        if (result.hookError) {
          // The base event has already been emitted (captureEvent returns only after that). This
          // is the consumer's hook error escaping the document-listener callback on purpose, so it
          // still reaches window.onerror / error monitoring with a real stack instead of being
          // silently swallowed. A hook is untrusted code, so it may have thrown a non-Error value
          // (including a falsy one, or `null`) — wrapped here with `cause` set to the original so
          // error monitoring still attributes it to the consumer's element hook, not to this
          // handler.
          throw result.hookError.value instanceof Error
            ? result.hookError.value
            : new Error('Telemetry element hook threw a non-Error value', {
                cause: result.hookError.value,
              });
        }
      }

      function captureEvent(e: Event): CaptureEventResult {
        /** * Don't mess with this code without running IE8 tests on it ***/
        let target = getEventTarget(e);
        if (isTextNode(target)) {
          // Safari bug (see: http://www.quirksmode.org/js/events_properties.html)
          target = (target.parentNode ?? null) as Element | null;
        }

        if (!target || !shouldCaptureDomEvent(target, e)) {
          return {};
        }

        const hookErrorRef: HookErrorRef = {};
        const captured = getDataForAutocaptureElement(target, e, hookErrorRef);

        if (captured !== false) {
          context.logEvent({
            name: `autocapture_${e.type}`,
            data: captured.data,
            ...captured.context,
          });
        }

        return hookErrorRef.current ? { hookError: hookErrorRef.current } : {};
      }

      function getDataForAutocaptureElement(
        target: Element,
        e: Event,
        hookErrorRef: HookErrorRef,
      ): AutocaptureElementData | false {
        let result: TelemetryData | undefined = undefined;
        let href: string | undefined;
        let contribution: AutocaptureElementContribution = { context: {}, data: {} };

        for (const el of eachParentElement(target, true)) {
          if (el.getAttribute('data-telemetry-no-capture') === 'false') {
            return false;
          }

          if (!shouldCaptureElement(el)) {
            return false;
          }

          const appliedContribution = applyElementHook(el, contribution, hookErrorRef);
          if (appliedContribution === false) {
            return false;
          }
          contribution = appliedContribution;

          const tagName = el.tagName.toLowerCase();

          // if the element or a parent element is an anchor tag
          // include the href as a property
          if (tagName === 'a') {
            const value = el.getAttribute('href');
            if (value !== null && shouldCaptureValue(value)) {
              href = value;
            }
          }

          const currentElData: TelemetryData = {
            $el_tag_name: tagName,
            ...getAttributesFromElement(el),
          };

          const text = getTextContent(el);
          if (text) {
            currentElData.$el_text = limitText(text);
          }

          // TODO: maybe we should send smth from parent elements as well
          if (autocaptureElements.includes(tagName)) {
            result ??= currentElData;
          }
        }

        if (!result) {
          return false;
        }

        if (href) {
          result.$el_attr_href = href;
          const hrefHost = convertToURL(href)?.host;
          const locationHost = window?.location?.host;
          if (hrefHost && locationHost && hrefHost !== locationHost && e.type === 'click') {
            result.$external_click_url = href;
          }
        }

        if (Object.keys(result).length === 0) {
          return false;
        }

        // Autocapture's own $el_*/$external_* keys are spread last so they always win over any
        // hook-contributed custom data of the same name.
        return { data: { ...contribution.data, ...result }, context: contribution.context };
      }

      function applyElementHook(
        el: Element,
        contribution: AutocaptureElementContribution,
        hookErrorRef: HookErrorRef,
      ): AutocaptureElementContribution | false {
        const hook = getElementHook(el);
        if (!hook) {
          return contribution;
        }

        let result: TelemetryElementHookResult;
        try {
          result = hook();
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
          hookErrorRef.current ??= { value: error };
          return contribution;
        }

        // Processing the hook's result is autocapture's own code, not the untrusted call — it
        // stays outside the try so a bug here surfaces as a genuine internal error that propagates
        // straight out of `handler` (see above), never misattributed as a hook error.
        if (!result) {
          return contribution;
        }

        if (result.capture === false) {
          return false;
        }

        return mergeElementHookContribution(contribution, result);
      }

      function getAttributesFromElement(elem: Element): TelemetryData {
        const result: TelemetryData = {};

        for (const attr of elem.attributes) {
          if (attributeIgnoreList.includes(attr.name)) {
            continue;
          }

          if (attr.name === 'class') {
            const classes = elem.classList.toString();

            if (classes) {
              result.$el_attr_class = classes;
            }

            continue;
          }

          // Only capture attributes we know are safe
          if (isSensitiveElement(elem) && !['name', 'id', 'aria-label'].includes(attr.name)) {
            continue;
          }

          if (shouldCaptureValue(attr.value)) {
            result[`$el_attr_${attr.name}`] = limitText(attr.value);
          }
        }

        return result;
      }
    },
  };
}
