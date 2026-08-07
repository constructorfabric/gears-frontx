import { isElementNode, isShadowRoot, isTag } from '../../utils/dom';
import { telemetryElementHookAttributionKeys, telemetryElementHookKey } from './elementHook';
import type {
  TelemetryElementHook,
  TelemetryElementHookAttribution,
  TelemetryElementHookAttributionKey,
  TelemetryElementHookResult,
} from './elementHook';

export function limitText(text: string, length = 1000): string {
  if (text.length > length) {
    return `${text.slice(0, length)}...`;
  }

  return text;
}

export function convertToURL(text: string) {
  try {
    return new URL(text, location.origin);
  } catch {
    return undefined;
  }
}

// Define the core pattern for matching credit card numbers
const coreCCPattern =
  '(4[0-9]{12}(?:[0-9]{3})?)|(5[1-5][0-9]{14})|(6(?:011|5[0-9]{2})[0-9]{12})|(3[47][0-9]{13})|(3(?:0[0-5]|[68][0-9])[0-9]{11})|((?:2131|1800|35[0-9]{3})[0-9]{11})';
// Create the Anchored version of the regex by adding '^' at the start and '$' at the end
const anchoredCCRegex = new RegExp(`^(?:${coreCCPattern})$`);
// The Unanchored version is essentially the core pattern, usable as is for partial matches
const unanchoredCCRegex = new RegExp(coreCCPattern);

// Define the core pattern for matching SSNs with optional dashes
const coreSSNPattern = '\\d{3}-?\\d{2}-?\\d{4}';
// Create the Anchored version of the regex by adding '^' at the start and '$' at the end
const anchoredSSNRegex = new RegExp(`^(${coreSSNPattern})$`);
// The Unanchored version is essentially the core pattern itself, usable for partial matches
const unanchoredSSNRegex = new RegExp(`(${coreSSNPattern})`);

export const autocaptureTextElements = ['a', 'button', 'label'];
export const autocaptureElements = ['a', 'button', 'form', 'input', 'select', 'textarea', 'label'];
export const noCaptureAttribute = 'data-telemetry-no-capture';

export const attributeIgnoreList = ['style', 'fill', 'viewBox', 'xmlns', noCaptureAttribute];

// @cpt-algo:cpt-frontx-telemetry-algo-dom-autocapture-redaction-decision:p1
export function shouldCaptureValue(
  value: string | undefined | null,
  anchorRegexes = true,
): boolean {
  const text = value && typeof value === 'string' ? value.trim() : undefined;

  if (!text) {
    return false;
  }

  // check to see if input value looks like a credit card number
  // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-redaction-decision:p1:inst-reject-card-pattern
  const ccRegex = anchorRegexes ? anchoredCCRegex : unanchoredCCRegex;
  if (ccRegex.test(text.replace(/[- ]/g, ''))) {
    return false;
  }
  // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-redaction-decision:p1:inst-reject-card-pattern

  // check to see if input value looks like a social security number
  // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-redaction-decision:p1:inst-reject-national-id
  const ssnRegex = anchorRegexes ? anchoredSSNRegex : unanchoredSSNRegex;
  if (ssnRegex.test(text)) {
    return false;
  }
  // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-redaction-decision:p1:inst-reject-national-id

  // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-redaction-decision:p1:inst-return-decisions
  return true;
  // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-redaction-decision:p1:inst-return-decisions
}

// Returning false here abandons the whole autocapture event in the caller's walk, not merely this
// element's fields — a partial record from a sensitive form still discloses that it was used.
export function shouldCaptureElement(el: Element) {
  // don't include hidden or password fields
  // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-redaction-decision:p1:inst-sensitive-input-type
  const type = (el as HTMLInputElement).type || '';
  // it's possible for el.type to be a DOM element if el is a form with a child input[name="type"]
  if (['hidden', 'password'].includes(type.toLowerCase())) {
    return false;
  }
  // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-redaction-decision:p1:inst-sensitive-input-type

  // filter out data from fields that look like sensitive fields
  // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-redaction-decision:p1:inst-sensitive-name-pattern
  const name = (el as HTMLInputElement).name || el.id || '';
  // it's possible for el.name or el.id to be a DOM element if el is a form with a child input[name="name"]
  if (typeof name === 'string') {
    const sensitiveNameRegex =
      /^cvv|exp|pass|securitynum|socialsec|socsec|cc|cardnum|ccnum|creditcard|csc|cvc|ssn|pwd|routing|seccode|securitycode/i;
    if (sensitiveNameRegex.test(name.replace(/[^a-zA-Z0-9]/g, ''))) {
      return false;
    }
  }
  // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-redaction-decision:p1:inst-sensitive-name-pattern

  return true;
}

export function shouldCaptureDomEvent(el: Element, event: Event): boolean {
  if (!el || isTag(el, 'html') || !isElementNode(el)) {
    return false;
  }

  if (isPointerCursor(el) && event.type === 'click') {
    return true;
  }

  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case 'html':
      return false;
    case 'form':
      return event.type === 'submit';
    case 'input':
    case 'select':
    case 'textarea':
      return ['change', 'click'].includes(event.type);
    default:
      if (isInteractiveElement(el)) {
        return event.type === 'click';
      }

      return (
        event.type === 'click' &&
        (autocaptureElements.includes(tag) || el.getAttribute('contenteditable') === 'true')
      );
  }
}

function isInteractiveElement(el: Element) {
  for (const parentNode of eachParentElement(el)) {
    if (!isElementNode(parentNode)) break;

    if (autocaptureElements.includes(parentNode.tagName.toLowerCase())) {
      return true;
    } else if (isPointerCursor(parentNode)) {
      return true;
    }
  }

  return false;
}

function isPointerCursor(el: Element) {
  const compStyles = window.getComputedStyle(el);
  return compStyles?.getPropertyValue('cursor') === 'pointer';
}

export function getTextContent(el: Element) {
  if (
    autocaptureTextElements.includes(el.tagName.toLowerCase()) &&
    el.textContent &&
    shouldCaptureValue(el.textContent)
  ) {
    return el.textContent;
  }

  return undefined;
}

export function getElementHook(el: Element): TelemetryElementHook | undefined {
  return el[telemetryElementHookKey];
}

/** An element hook's contribution once validated: typed attribution fields plus custom data. */
export type AutocaptureElementContribution = {
  context: Partial<TelemetryElementHookAttribution>;
  data: Record<string, unknown>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A contribution counts as usable when it carries either attribution or data, which is what makes
// the closest hook's whole field set — context and data together — win as a unit.
// @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-merge-contribution:p1:inst-closest-data-wins
function isUsableContribution(contribution: AutocaptureElementContribution): boolean {
  return (
    Object.values(contribution.context).some((value) => value !== undefined) ||
    Object.keys(contribution.data).length > 0
  );
}
// @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-merge-contribution:p1:inst-closest-data-wins

/**
 * Keeps only the fields an element hook is allowed to set on the record (an allowlist, not a
 * denylist): hook results cross a package/deployment boundary the type checker can't police for
 * every caller, so a type-unsafe caller's other fields — or fields from an older/newer build of
 * the type — must never reach the merged record.
 */
// @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-merge-contribution:p1:inst-allowlist-attribution
function pickAttributionFields(
  source: Record<string, unknown>,
): Partial<TelemetryElementHookAttribution> {
  const picked: Partial<Record<TelemetryElementHookAttributionKey, unknown>> = {};
  for (const key of telemetryElementHookAttributionKeys) {
    if (key in source) {
      picked[key] = source[key];
    }
  }
  return picked as Partial<TelemetryElementHookAttribution>;
}
// @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-merge-contribution:p1:inst-allowlist-attribution

/**
 * Drops any key a hook's `data` sets starting with `$`: that prefix is reserved for autocapture's
 * own `$el_*`/`$external_*` keys, so a future one can never be silently shadowed by a
 * hook-contributed key of the same name.
 */
// @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-merge-contribution:p1:inst-strip-reserved-keys
function stripReservedDataKeys(source: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!key.startsWith('$')) {
      picked[key] = value;
    }
  }
  return picked;
}
// @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-merge-contribution:p1:inst-strip-reserved-keys

function buildElementHookContribution(
  result: Exclude<TelemetryElementHookResult, void>,
): AutocaptureElementContribution {
  return {
    context: isPlainObject(result.context) ? pickAttributionFields(result.context) : {},
    // Autocapture's own $el_*/$external_* keys are layered on top of this later and always win;
    // this is only the hook's side of the merge.
    data: isPlainObject(result.data) ? stripReservedDataKeys(result.data) : {},
  };
}

// @cpt-algo:cpt-frontx-telemetry-algo-dom-autocapture-merge-contribution:p1
export function mergeElementHookContribution(
  target: AutocaptureElementContribution,
  result: Exclude<TelemetryElementHookResult, void>,
): AutocaptureElementContribution {
  // Atomic per registering element: a hook's contribution describes ONE element and must never
  // be split across two hooks (e.g. pairing an inner element's service_name with an outer
  // element's call_chain, or an inner element's context with an outer element's data). `target`
  // holds whatever the closest hook visited so far already contributed; once it's usable, no
  // farther-out hook is allowed to override or partially fill it — a registering element's whole
  // contribution wins together, or not at all.
  // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-merge-contribution:p1:inst-closest-attribution-wins
  if (isUsableContribution(target)) {
    return target;
  }
  // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-merge-contribution:p1:inst-closest-attribution-wins

  // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-merge-contribution:p1:inst-adopt-whole-set
  // @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-merge-contribution:p1:inst-return-contribution
  const contribution = buildElementHookContribution(result);
  return isUsableContribution(contribution) ? contribution : target;
  // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-merge-contribution:p1:inst-return-contribution
  // @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-merge-contribution:p1:inst-adopt-whole-set
}

export function* eachParentElement(target: Element, includeTarget = false) {
  if (includeTarget) {
    yield target;
  }

  let curEl = target;
  while (curEl.parentNode && !isTag(curEl, 'body')) {
    // The walk only stops at `body`, so an element parented outside it climbs to
    // `documentElement`, whose parentNode is the document itself. A shadow root reached from a
    // detached tree has no `host`. Neither is an Element, and the consumers call Element methods.
    const parent = isShadowRoot(curEl.parentNode)
      ? curEl.parentNode.host
      : (curEl.parentNode as Element);

    if (!isElementNode(parent)) {
      return;
    }

    yield parent;
    curEl = parent;
  }
}
