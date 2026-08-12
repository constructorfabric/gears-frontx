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
 *    front of the shadow root, bringing the full compiled Tailwind CSS (including
 *    MFE utilities, since the host's content paths cover src/mfe_packages/**).
 *    Front, not back, so the MFE's own stylesheets outrank them - see the method.
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
   *
   * The clones are inserted ahead of everything already in the shadow root, never
   * appended, because adopted host styles are context rather than authority: where
   * they and the MFE's own CSS declare the same property at equal specificity, the
   * MFE has to win. Appending inverted that. `MfeHandlerMF` injects the MFE's
   * compiled stylesheet into the shadow root before it calls mount, so an appended
   * clone of the shell's Tailwind preflight - whose
   * `button, [type='button'], [type='reset'], [type='submit']` rule sets
   * `background-color: transparent` at specificity (0,1,0) - tied with
   * `@gears-frontx/ui-kit`'s single-class button rule and won on document order,
   * leaving every kit Button transparent until it was hovered.
   *
   * Inserting at the front rather than pushing MFE styles to the back is what makes
   * the invariant hold for stylesheets that appear after mount too - a lazily
   * imported component's CSS module, or whatever initializeStyles() adds - since
   * those land behind the adopted block by construction.
   *
   * A cascade layer around the adopted CSS was the alternative and is rejected:
   * layered rules lose to unlayered ones at *any* specificity, so a host utility
   * class would stop overriding an MFE element selector. Document order keeps
   * specificity in charge and only settles the ties.
   */
  protected adoptHostStylesIntoShadowRoot(shadowRoot: ShadowRoot): void {
    const adoptedStyles = document.createDocumentFragment();

    const styleElements = document.head.querySelectorAll('style');
    styleElements.forEach((el) => {
      const clone = document.createElement('style');
      clone.textContent = el.textContent ?? '';
      adoptedStyles.appendChild(clone);
    });
    const linkElements = document.head.querySelectorAll('link[rel="stylesheet"]');
    linkElements.forEach((el) => {
      adoptedStyles.appendChild(el.cloneNode(true));
    });

    // Staged in a fragment so the adopted pieces keep their host-document order
    // relative to each other while moving as one block to the front.
    shadowRoot.insertBefore(adoptedStyles, shadowRoot.firstChild);
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
