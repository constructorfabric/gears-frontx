export function getEventTarget(e: Event): Element | null {
  // https://developer.mozilla.org/en-US/docs/Web/API/Event/target#Compatibility_notes
  if (!e.target) {
    return (e.srcElement as Element) || null;
  } else {
    if ((e.target as HTMLElement)?.shadowRoot) {
      return (e.composedPath()[0] as Element) || null;
    }
    return (e.target as Element) || null;
  }
}

export function isTextNode(el: Element | undefined | null): el is HTMLElement {
  return !!el && el.nodeType === 3;
}

export function isElementNode(el: Node | Element | undefined | null): el is Element {
  return !!el && el.nodeType === 1;
}

export function isTag(el: Element | undefined | null, tag: string): el is HTMLElement {
  return !!el && !!el.tagName && el.tagName.toLowerCase() === tag.toLowerCase();
}

// nodeType 11 is what a live element's `parentNode` resolves to when it sits at the top of a
// shadow tree — the runtime DOM-walk case this guards.
export function isShadowRoot(el: Element | ParentNode | undefined | null): el is ShadowRoot {
  return !!el && el.nodeType === 11;
}

// Free-text and selection controls: attribute reading on these is narrowed by the caller to name,
// identifier and accessible label. Unlike the whole-event drops, this one restricts fields.
// @cpt-begin:cpt-frontx-telemetry-algo-dom-autocapture-redaction-decision:p1:inst-sensitive-free-text
export function isSensitiveElement(el: Element): boolean {
  // don't send data from inputs or similar elements since there will always be
  // a risk of clientside javascript placing sensitive data in attributes
  const allowedInputTypes = ['button', 'checkbox', 'submit', 'reset'];

  return (
    (isTag(el, 'input') && !allowedInputTypes.includes((el as HTMLInputElement).type)) ||
    isTag(el, 'select') ||
    isTag(el, 'textarea') ||
    el.getAttribute('contenteditable') === 'true'
  );
}
// @cpt-end:cpt-frontx-telemetry-algo-dom-autocapture-redaction-decision:p1:inst-sensitive-free-text
