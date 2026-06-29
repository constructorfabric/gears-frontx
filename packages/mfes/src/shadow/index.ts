/**
 * Shadow DOM Utilities
 *
 * Framework-agnostic Shadow DOM utilities for MFE style isolation.
 * Pure functions with no state - no class wrapper needed per architecture rules.
 * Extracted from @gears-frontx/screensets in Phase 7 (extension-domain governance).
 *
 * @packageDocumentation
 */

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

export function injectCssVariables(
  shadowRoot: ShadowRoot,
  variables: Record<string, string>
): void {
  const styleId = '__frontx-css-variables__';
  let styleElement = shadowRoot.getElementById(styleId) as HTMLStyleElement | null;

  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = styleId;
    shadowRoot.appendChild(styleElement);
  }

  const cssRules = Object.entries(variables)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');

  styleElement.textContent = `
:host {
${cssRules}
}
  `.trim();
}

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
