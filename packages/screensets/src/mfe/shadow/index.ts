/**
 * Shadow DOM Utilities
 *
 * Framework-agnostic Shadow DOM utilities for MFE style isolation.
 * Pure functions with no state - no class wrapper needed per architecture rules.
 *
 * @packageDocumentation
 */

/**
 * Shadow root configuration options
 */
export interface ShadowRootOptions {
  /** Shadow DOM mode */
  mode?: 'open' | 'closed';
  /** Whether the shadow root delegates focus */
  delegatesFocus?: boolean;
}

/**
 * Create a shadow root on the given element.
 *
 * @param element - The element to attach the shadow root to
 * @param options - Shadow root configuration
 * @returns The created shadow root
 *
 * @example
 * ```typescript
 * const container = document.getElementById('mfe-container');
 * const shadowRoot = createShadowRoot(container, { mode: 'open' });
 * ```
 */
export function createShadowRoot(
  element: HTMLElement,
  options: ShadowRootOptions = {}
): ShadowRoot {
  const { mode = 'open', delegatesFocus = false } = options;

  // Get or create shadow root
  let shadowRoot: ShadowRoot;
  if (element.shadowRoot) {
    shadowRoot = element.shadowRoot;
  } else {
    shadowRoot = element.attachShadow({ mode, delegatesFocus });
  }

  // Inject isolation styles automatically (idempotent)
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
 * Inject CSS custom properties (variables) into the shadow root.
 * Creates or updates a :host rule with the provided variables.
 *
 * @param shadowRoot - The shadow root to inject variables into
 * @param variables - CSS custom properties to inject
 *
 * @example
 * ```typescript
 * injectCssVariables(shadowRoot, {
 *   '--primary-color': '#007bff',
 *   '--font-family': 'Arial, sans-serif'
 * });
 * ```
 */
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

  // Generate CSS custom properties
  const cssRules = Object.entries(variables)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');

  styleElement.textContent = `
:host {
${cssRules}
}
  `.trim();
}

/**
 * Inject a stylesheet into the shadow root.
 * If an id is provided, will update existing stylesheet with that id.
 *
 * @param shadowRoot - The shadow root to inject the stylesheet into
 * @param css - CSS content to inject
 * @param id - Optional id for the stylesheet (for updating)
 *
 * @example
 * ```typescript
 * injectStylesheet(shadowRoot, `
 *   .widget { padding: 16px; }
 *   .widget-title { font-size: 20px; }
 * `, 'widget-styles');
 *
 * // Later update the same stylesheet
 * injectStylesheet(shadowRoot, `
 *   .widget { padding: 24px; }
 *   .widget-title { font-size: 24px; }
 * `, 'widget-styles');
 * ```
 */
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
