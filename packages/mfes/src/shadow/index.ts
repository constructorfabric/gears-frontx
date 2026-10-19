/**
 * Shadow DOM Utilities
 *
 * Framework-agnostic Shadow DOM utilities for MFE style isolation.
 * Pure functions with no state - no class wrapper needed per architecture rules.
 *
 * @packageDocumentation
 */
// @cpt-algo:cpt-frontx-algo-mfe-host-communication-host-theme:p2

export interface ShadowRootOptions {
  mode?: 'open' | 'closed';
  delegatesFocus?: boolean;
}

export function createShadowRoot(
  element: HTMLElement,
  options: ShadowRootOptions = {}
): ShadowRoot {
  const { mode = 'open', delegatesFocus = false } = options;

  let shadowRoot: ShadowRoot;
  if (element.shadowRoot) {
    shadowRoot = element.shadowRoot;
  } else {
    shadowRoot = element.attachShadow({ mode, delegatesFocus });
  }

  const isolationStyleId = '__frontx-shadow-isolation__';
  if (!shadowRoot.getElementById(isolationStyleId)) {
    const styleElement = document.createElement('style');
    styleElement.id = isolationStyleId;
    styleElement.textContent = `
:host {
  all: initial;
  display: block;
}
    `.trim();
    shadowRoot.appendChild(styleElement);
  }

  return shadowRoot;
}

/**
 * Id of the one style element that holds the host theme variables in a shadow
 * root. Shared with the mount manager, which removes that element when a theme
 * carries no variables; kept off the package barrel.
 */
export const CSS_VARIABLES_STYLE_ID = '__frontx-css-variables__';

// Attribute names and values the scoped rule accepts: both are written into
// a quoted attribute selector without escaping, so anything outside this set
// is refused rather than allowed to break or extend the rule.
const SCOPE_TOKEN = /^[A-Za-z][A-Za-z0-9_-]*$/;

/**
 * Write the host theme variables into the shadow root's single variables
 * style, replacing what it held.
 *
 * Without `scope` the rule is `:host { ... }`. With it the rule is
 * `:host([A='V']), [A='V'][A='V'] { ... }`: the repeated attribute gives the
 * declarations specificity above a same-name declaration on `[A='V']` inside
 * the shadow root, so the host's variables win on every element of that
 * appearance. A scope attribute or value outside `SCOPE_TOKEN` throws.
 */
// @cpt-begin:cpt-frontx-algo-mfe-host-communication-host-theme:p1:inst-ht-variables
export function injectCssVariables(
  shadowRoot: ShadowRoot,
  variables: Record<string, string>,
  scope?: { attribute: string; value: string }
): void {
  if (scope && !(SCOPE_TOKEN.test(scope.attribute) && SCOPE_TOKEN.test(scope.value))) {
    throw new Error(
      `Invalid CSS variables scope: attribute '${scope.attribute}', value '${scope.value}'. ` +
      'Expected each to be a letter followed by letters, digits, "_" or "-".'
    );
  }

  const styleId = CSS_VARIABLES_STYLE_ID;
  let styleElement = shadowRoot.getElementById(styleId) as HTMLStyleElement | null;

  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = styleId;
    shadowRoot.appendChild(styleElement);
  }

  const cssRules = Object.entries(variables)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');

  const selector = scope
    ? `:host([${scope.attribute}='${scope.value}']), [${scope.attribute}='${scope.value}'][${scope.attribute}='${scope.value}']`
    : ':host';
  styleElement.textContent = `
${selector} {
${cssRules}
}
  `.trim();
}
// @cpt-end:cpt-frontx-algo-mfe-host-communication-host-theme:p1:inst-ht-variables

export function injectStylesheet(
  shadowRoot: ShadowRoot,
  css: string,
  id?: string
): void {
  let styleElement: HTMLStyleElement | null = null;

  if (id) {
    styleElement = shadowRoot.getElementById(id) as HTMLStyleElement | null;
  }

  if (!styleElement) {
    styleElement = document.createElement('style');
    if (id) {
      styleElement.id = id;
    }
    shadowRoot.appendChild(styleElement);
  }

  styleElement.textContent = css;
}
