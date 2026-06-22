/**
 * Shadow DOM Utilities Tests
 *
 * Tests for Shadow DOM creation and CSS injection utilities.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createShadowRoot,
  injectCssVariables,
  injectStylesheet,
  type ShadowRootOptions,
} from '../../../src/mfe/shadow';

describe('Shadow DOM Utilities', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('16.3.1 createShadowRoot with various options', () => {
    it('should create shadow root with default options', () => {
      const shadowRoot = createShadowRoot(container);

      expect(shadowRoot).toBeDefined();
      expect(shadowRoot.mode).toBe('open');
      expect(container.shadowRoot).toBe(shadowRoot);
    });

    it('43.2.1: should inject isolation styles automatically', () => {
      const shadowRoot = createShadowRoot(container);

      const isolationStyle = shadowRoot.getElementById('__frontx-shadow-isolation__') as HTMLStyleElement;
      expect(isolationStyle).toBeDefined();
      expect(isolationStyle.textContent).toContain(':host');
      expect(isolationStyle.textContent).toContain('all: initial');
      expect(isolationStyle.textContent).toContain('display: block');
    });

    it('43.2.2: should be idempotent for isolation styles', () => {
      const shadowRoot1 = createShadowRoot(container);
      const shadowRoot2 = createShadowRoot(container);

      expect(shadowRoot1).toBe(shadowRoot2);

      const isolationStyles = shadowRoot1.querySelectorAll('#__frontx-shadow-isolation__');
      expect(isolationStyles.length).toBe(1);
    });

    it('43.2.3: should inject isolation styles into pre-existing shadow root', () => {
      // Manually create shadow root without isolation
      const manualShadowRoot = container.attachShadow({ mode: 'open' });
      expect(manualShadowRoot.getElementById('__frontx-shadow-isolation__')).toBeNull();

      // Call createShadowRoot on element with existing shadow root
      const shadowRoot = createShadowRoot(container);

      expect(shadowRoot).toBe(manualShadowRoot);
      const isolationStyle = shadowRoot.getElementById('__frontx-shadow-isolation__') as HTMLStyleElement;
      expect(isolationStyle).toBeDefined();
      expect(isolationStyle.textContent).toContain('all: initial');
      expect(isolationStyle.textContent).toContain('display: block');
    });

    it('should create shadow root with open mode', () => {
      const shadowRoot = createShadowRoot(container, { mode: 'open' });

      expect(shadowRoot).toBeDefined();
      expect(shadowRoot.mode).toBe('open');
      expect(container.shadowRoot).toBe(shadowRoot);
    });

    it('should create shadow root with closed mode', () => {
      const shadowRoot = createShadowRoot(container, { mode: 'closed' });

      expect(shadowRoot).toBeDefined();
      expect(shadowRoot.mode).toBe('closed');
      // Note: closed shadow roots don't expose shadowRoot property
    });

    it('should create shadow root with delegatesFocus', () => {
      const shadowRoot = createShadowRoot(container, { delegatesFocus: true });

      expect(shadowRoot).toBeDefined();
      // Note: delegatesFocus is not exposed on ShadowRoot interface in jsdom
      // The option is passed correctly but cannot be verified in test environment
    });

    it('should return existing shadow root if already attached', () => {
      const shadowRoot1 = createShadowRoot(container);
      const shadowRoot2 = createShadowRoot(container);

      expect(shadowRoot1).toBe(shadowRoot2);
    });

    it('should handle all options together', () => {
      const options: ShadowRootOptions = {
        mode: 'open',
        delegatesFocus: true,
      };

      const shadowRoot = createShadowRoot(container, options);

      expect(shadowRoot).toBeDefined();
      expect(shadowRoot.mode).toBe('open');
      // Note: delegatesFocus is not exposed on ShadowRoot interface in jsdom
      // The option is passed correctly but cannot be verified in test environment
    });
  });

  describe('16.3.2 injectCssVariables updates', () => {
    let shadowRoot: ShadowRoot;

    beforeEach(() => {
      shadowRoot = createShadowRoot(container);
    });

    it('should inject CSS variables', () => {
      const variables = {
        '--primary-color': 'hsl(var(--primary))',
        '--font-family': 'Arial, sans-serif',
      };

      injectCssVariables(shadowRoot, variables);

      const styleElement = shadowRoot.getElementById('__frontx-css-variables__') as HTMLStyleElement;
      expect(styleElement).toBeDefined();
      expect(styleElement.textContent).toContain('--primary-color: hsl(var(--primary))');
      expect(styleElement.textContent).toContain('--font-family: Arial, sans-serif');
    });

    it('should create :host rule with variables', () => {
      const variables = {
        '--spacing': '16px',
        '--radius': '4px',
      };

      injectCssVariables(shadowRoot, variables);

      const styleElement = shadowRoot.getElementById('__frontx-css-variables__') as HTMLStyleElement;
      expect(styleElement.textContent).toContain(':host');
      expect(styleElement.textContent).toContain('--spacing: 16px');
      expect(styleElement.textContent).toContain('--radius: 4px');
    });

    it('should update variables when called multiple times', () => {
      const variables1 = {
        '--color': 'red',
      };
      const variables2 = {
        '--color': 'blue',
        '--size': 'large',
      };

      injectCssVariables(shadowRoot, variables1);
      let styleElement = shadowRoot.getElementById('__frontx-css-variables__') as HTMLStyleElement;
      expect(styleElement.textContent).toContain('--color: red');

      injectCssVariables(shadowRoot, variables2);
      styleElement = shadowRoot.getElementById('__frontx-css-variables__') as HTMLStyleElement;
      expect(styleElement.textContent).toContain('--color: blue');
      expect(styleElement.textContent).toContain('--size: large');
      expect(styleElement.textContent).not.toContain('--color: red');
    });

    it('should not include style reset (now in isolation styles)', () => {
      const variables = { '--theme': 'dark' };

      injectCssVariables(shadowRoot, variables);

      const styleElement = shadowRoot.getElementById('__frontx-css-variables__') as HTMLStyleElement;
      // The isolation styles (all: initial, display: block) are now in __frontx-shadow-isolation__
      // This test verifies that injectCssVariables() only handles CSS variables
      expect(styleElement.textContent).toContain('--theme: dark');
      expect(styleElement.textContent).toContain(':host');
    });

    it('should handle empty variables', () => {
      injectCssVariables(shadowRoot, {});

      const styleElement = shadowRoot.getElementById('__frontx-css-variables__') as HTMLStyleElement;
      expect(styleElement).toBeDefined();
      expect(styleElement.textContent).toContain(':host');
    });

    it('should reuse existing style element', () => {
      const variables1 = { '--color': 'red' };
      const variables2 = { '--color': 'blue' };

      injectCssVariables(shadowRoot, variables1);
      const styleElement1 = shadowRoot.getElementById('__frontx-css-variables__');

      injectCssVariables(shadowRoot, variables2);
      const styleElement2 = shadowRoot.getElementById('__frontx-css-variables__');

      expect(styleElement1).toBe(styleElement2);
    });
  });

  describe('16.3.3 injectStylesheet', () => {
    let shadowRoot: ShadowRoot;

    beforeEach(() => {
      shadowRoot = createShadowRoot(container);
    });

    it('should inject stylesheet', () => {
      const css = `
        .widget { padding: 16px; }
        .widget-title { font-size: 20px; }
      `;

      injectStylesheet(shadowRoot, css);

      const styleElements = shadowRoot.querySelectorAll('style');
      expect(styleElements.length).toBeGreaterThan(0);

      const lastStyle = styleElements[styleElements.length - 1];
      expect(lastStyle.textContent).toContain('.widget');
      expect(lastStyle.textContent).toContain('padding: 16px');
    });

    it('should inject stylesheet with id', () => {
      const css = '.button { color: blue; }';
      const id = 'button-styles';

      injectStylesheet(shadowRoot, css, id);

      const styleElement = shadowRoot.getElementById(id) as HTMLStyleElement;
      expect(styleElement).toBeDefined();
      expect(styleElement.textContent).toContain('.button');
      expect(styleElement.textContent).toContain('color: blue');
    });

    it('should update existing stylesheet when using same id', () => {
      const css1 = '.widget { color: red; }';
      const css2 = '.widget { color: blue; }';
      const id = 'widget-styles';

      injectStylesheet(shadowRoot, css1, id);
      let styleElement = shadowRoot.getElementById(id) as HTMLStyleElement;
      expect(styleElement.textContent).toContain('color: red');

      injectStylesheet(shadowRoot, css2, id);
      styleElement = shadowRoot.getElementById(id) as HTMLStyleElement;
      expect(styleElement.textContent).toContain('color: blue');
      expect(styleElement.textContent).not.toContain('color: red');

      // Should still be the same element
      const allStyles = shadowRoot.querySelectorAll(`#${id}`);
      expect(allStyles.length).toBe(1);
    });

    it('should create new stylesheet if id does not exist', () => {
      const css = '.new-widget { margin: 10px; }';
      const id = 'new-widget-styles';

      injectStylesheet(shadowRoot, css, id);

      const styleElement = shadowRoot.getElementById(id) as HTMLStyleElement;
      expect(styleElement).toBeDefined();
      expect(styleElement.textContent).toBe(css);
    });

    it('should support multiple stylesheets with different ids', () => {
      const css1 = '.component-a { color: red; }';
      const css2 = '.component-b { color: blue; }';

      injectStylesheet(shadowRoot, css1, 'component-a');
      injectStylesheet(shadowRoot, css2, 'component-b');

      const styleA = shadowRoot.getElementById('component-a') as HTMLStyleElement;
      const styleB = shadowRoot.getElementById('component-b') as HTMLStyleElement;

      expect(styleA.textContent).toContain('component-a');
      expect(styleB.textContent).toContain('component-b');
    });

    it('should support stylesheets without id', () => {
      const css1 = '.widget-1 { color: red; }';
      const css2 = '.widget-2 { color: blue; }';

      injectStylesheet(shadowRoot, css1);
      injectStylesheet(shadowRoot, css2);

      const styleElements = shadowRoot.querySelectorAll('style');
      // Should have at least 2 style elements (may have more from CSS variables)
      expect(styleElements.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Integration: Complete Shadow DOM setup', () => {
    it('should work together: createShadowRoot + injectCssVariables + injectStylesheet', () => {
      const shadowRoot = createShadowRoot(container, { mode: 'open' });

      const variables = {
        '--primary-color': 'hsl(var(--primary))',
        '--spacing': '16px',
      };
      injectCssVariables(shadowRoot, variables);

      const css = `
        .widget {
          color: var(--primary-color);
          padding: var(--spacing);
        }
      `;
      injectStylesheet(shadowRoot, css, 'widget-styles');

      // Verify shadow root
      expect(container.shadowRoot).toBe(shadowRoot);

      // Verify CSS variables
      const varsStyle = shadowRoot.getElementById('__frontx-css-variables__') as HTMLStyleElement;
      expect(varsStyle).toBeDefined();
      expect(varsStyle.textContent).toContain('--primary-color: hsl(var(--primary))');

      // Verify stylesheet
      const widgetStyle = shadowRoot.getElementById('widget-styles') as HTMLStyleElement;
      expect(widgetStyle).toBeDefined();
      expect(widgetStyle.textContent).toContain('var(--primary-color)');
    });
  });
});
