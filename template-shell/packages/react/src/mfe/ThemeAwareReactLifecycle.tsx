// @cpt-flow:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type {
  FrontXApp,
  MfeEntryLifecycle,
  ChildMfeBridge,
  MfeMountContext,
} from '@gears-frontx/framework';
import { FrontXProvider } from '../FrontXProvider';
import { hasFrontXQueryClientActivator, resolveFrontXQueryClient } from '../queryClient';

interface ProviderMountOptions {
  mfeBridge?: {
    bridge: ChildMfeBridge;
    extensionId: string;
    domainId: string;
  };
}

function resolveProviderMountOptions(
  app: FrontXApp,
  bridge: ChildMfeBridge,
  mountContext?: MfeMountContext
): ProviderMountOptions {
  const extensionId = mountContext?.extensionId;
  const domainId = mountContext?.domainId;
  const isMountedMfe = typeof extensionId === 'string' && typeof domainId === 'string';

  if (
    isMountedMfe &&
    !resolveFrontXQueryClient(app) &&
    !hasFrontXQueryClientActivator(app)
  ) {
    throw new Error(
      '[FrontXProvider] Mounted MFEs require queryCacheShared() in the child app and queryCache() in the host app before loading the MFE app.'
    );
  }

  return {
    mfeBridge:
      isMountedMfe
        ? { bridge, extensionId, domainId }
        : undefined,
  };
}

interface MountRuntimeAwareProviderProps {
  readonly app: FrontXApp;
  readonly mfeBridge?: Readonly<{
    readonly bridge: ChildMfeBridge;
    readonly extensionId: string;
    readonly domainId: string;
  }>;
  readonly children: React.ReactNode;
}

function MountRuntimeAwareProvider({
  app,
  mfeBridge,
  children,
}: Readonly<MountRuntimeAwareProviderProps>): React.JSX.Element {
  return (
    <FrontXProvider app={app} mfeBridge={mfeBridge}>
      {children}
    </FrontXProvider>
  );
}

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
// @cpt-dod:cpt-frontx-dod-mfe-isolation-author-state-lifecycle:p1
export abstract class ThemeAwareReactLifecycle implements MfeEntryLifecycle<ChildMfeBridge> {
  private root: Root | null = null;

  constructor(private readonly app: FrontXApp) { }

  mount(container: Element | ShadowRoot, bridge: ChildMfeBridge, mountContext?: MfeMountContext): void {
    if (container instanceof ShadowRoot) {
      this.adoptHostStylesIntoShadowRoot(container);
    }

    this.injectBaseResets(container);
    this.initializeStyles(container);

    const providerMountOptions = resolveProviderMountOptions(this.app, bridge, mountContext);
    this.root = createRoot(container);
    this.root.render(
      <MountRuntimeAwareProvider
        app={this.app}
        mfeBridge={providerMountOptions.mfeBridge}
      >
        {this.renderContent(bridge)}
      </MountRuntimeAwareProvider>
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
    styleElements.forEach((el) => {
      const clone = document.createElement('style');
      clone.textContent = el.textContent ?? '';
      shadowRoot.appendChild(clone);
    });
    const linkElements = document.head.querySelectorAll('link[rel="stylesheet"]');
    linkElements.forEach((el) => {
      const clone = el.cloneNode(true) as HTMLLinkElement;
      shadowRoot.appendChild(clone);
    });
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
   * No-op by default: host styles adopted in adoptHostStylesIntoShadowRoot()
   * already include all Tailwind utilities compiled from MFE source files.
   */
  protected initializeStyles(_container: Element | ShadowRoot): void {
    // No-op by default.
  }

  /**
   * Return the screen-specific React component tree.
   */
  protected abstract renderContent(bridge: ChildMfeBridge): React.ReactNode;
}
