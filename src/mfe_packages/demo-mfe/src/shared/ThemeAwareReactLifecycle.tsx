import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { MfeEntryLifecycle, ChildMfeBridge } from '@gears-frontx/react';
import { HAI3Provider } from '@gears-frontx/react';
import { mfeApp } from '../init';

/**
 * Abstract base class for React-based MFE lifecycle implementations.
 *
 * Styling strategy:
 * 1. adoptHostStylesIntoShadowRoot() clones all host <style> and <link> into the
 *    shadow root, bringing the full compiled Tailwind CSS (including MFE utilities,
 *    since the host's content paths cover src/mfe_packages/**).
 * 2. injectBaseResets() adds box-model resets and :host defaults that aren't part
 *    of Tailwind's compiled output but are needed for consistent rendering.
 * 3. Subclasses may override initializeStyles() to inject additional CSS that is
 *    not covered by the host stylesheet (e.g., MFE-specific @font-face rules).
 *
 * Theme CSS variables are delivered via CSS inheritance from :root (Shadow DOM)
 * or via MountManager injection (iframe). MFE lifecycles do NOT need to subscribe
 * to theme changes or call applyThemeToShadowRoot.
 *
 * Concrete subclasses must provide:
 * - `renderContent(bridge)` - screen component rendering
 */
export abstract class ThemeAwareReactLifecycle implements MfeEntryLifecycle<ChildMfeBridge> {
  private root: Root | null = null;

  mount(container: Element | ShadowRoot, bridge: ChildMfeBridge): void {
    if (container instanceof ShadowRoot) {
      this.adoptHostStylesIntoShadowRoot(container);
    }

    this.injectBaseResets(container);
    this.initializeStyles(container);

    this.root = createRoot(container);
    this.root.render(
      <HAI3Provider app={mfeApp}>
        {this.renderContent(bridge)}
      </HAI3Provider>
    );
  }

  unmount(_container: Element | ShadowRoot): void {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }

  /**
   * Copy all inline <style> and <link rel="stylesheet"> from the host document
   * into the shadow root so that Tailwind and component styles apply inside the MFE.
   */
  protected adoptHostStylesIntoShadowRoot(shadowRoot: ShadowRoot): void {
    const styleElements = document.head.querySelectorAll('style');
    for (const el of styleElements) {
      const clone = document.createElement('style');
      clone.textContent = el.textContent ?? '';
      shadowRoot.appendChild(clone);
    }
    const linkElements = document.head.querySelectorAll('link[rel="stylesheet"]');
    for (const el of linkElements) {
      const clone = el.cloneNode(true) as HTMLLinkElement;
      shadowRoot.appendChild(clone);
    }
  }

  /**
   * Box-model resets and :host defaults needed inside every shadow root.
   * These aren't part of Tailwind's compiled output but are required for
   * consistent rendering across browsers.
   */
  private injectBaseResets(container: Element | ShadowRoot): void {
    const style = document.createElement('style');
    style.textContent = `
      *, *::before, *::after {
        box-sizing: border-box;
        border-width: 0;
        border-style: solid;
        border-color: currentColor;
      }
      * { margin: 0; padding: 0; }
      :host {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        line-height: 1.5;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        color: hsl(var(--foreground));
        background-color: hsl(var(--background));
      }
    `;
    container.appendChild(style);
  }

  /**
   * Hook for subclasses to inject additional CSS not covered by the adopted host
   * stylesheet (e.g., MFE-specific @font-face rules or custom animations).
   * No-op by default — Tailwind utilities are already provided by the host CSS.
   */
  protected initializeStyles(_container: Element | ShadowRoot): void {
    // No-op: host styles adopted in adoptHostStylesIntoShadowRoot() already
    // include all Tailwind utilities compiled from MFE source files.
  }

  /**
   * Return the screen-specific React component tree.
   */
  protected abstract renderContent(bridge: ChildMfeBridge): React.ReactNode;
}
