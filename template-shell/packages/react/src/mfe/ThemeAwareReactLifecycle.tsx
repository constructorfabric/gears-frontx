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

/**
 * Marks every node `adoptHostStylesIntoShadowRoot` puts into a shadow root, so
 * a later mount can find its own previous block and replace it.
 *
 * A marker attribute rather than the single `id` that
 * `injectStylesheet`/`injectCssVariables` key on in `@gears-frontx/mfes`'
 * shadow utilities, because the adopted block is many nodes whose order
 * relative to each other is load-bearing: one id can only name one of them.
 */
const ADOPTED_HOST_STYLE_ATTR = 'data-frontx-adopted-host-style';

/** Identity of the base-resets node, so a remount overwrites it in place. */
const BASE_RESETS_STYLE_ID = '__frontx-base-resets__';

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
 *
 * Both steps replace what a previous mount left rather than adding beside it,
 * because a remounted container arrives with its shadow root intact - see each
 * method for why that is the shape the fix takes.
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
   *
   * The block replaces its predecessor instead of stacking on it, the same
   * upsert shape `injectStylesheet` and `injectCssVariables` use in
   * `@gears-frontx/mfes`' shadow utilities, widened from one id-keyed node to a
   * marked block. Replacement is required rather than tidy: `createShadowRoot`
   * hands back an existing `element.shadowRoot` instead of attaching a new one,
   * so remounting the same container runs this method again on a shadow root
   * that already holds a full adopted block, and appending would grow it once
   * per mount with no bound and re-resolve every cloned `<link>`.
   *
   * The block is rebuilt from the host head rather than left in place, because
   * the head is not fixed: a lazily imported chunk adds stylesheets to it after
   * the first mount, and the second mount has to pick those up.
   */
  protected adoptHostStylesIntoShadowRoot(shadowRoot: ShadowRoot): void {
    shadowRoot.querySelectorAll(`[${ADOPTED_HOST_STYLE_ATTR}]`).forEach((el) => el.remove());

    const adoptedStyles = document.createDocumentFragment();

    // One query covering both kinds, because querySelectorAll returns document
    // order: querying <style> and <link> separately would concatenate the two
    // groups instead, so a host declaring <link A> before <style B> would get
    // them adopted as B then A. That reordering decides which rule wins every
    // specificity tie between them, which is the tie this whole method exists
    // to settle - so the adopted block has to preserve the host's own order,
    // not just sit ahead of the MFE's CSS.
    const hostStyleNodes = document.head.querySelectorAll('style, link[rel="stylesheet"]');
    hostStyleNodes.forEach((el) => {
      if (el instanceof HTMLStyleElement) {
        const clone = document.createElement('style');
        clone.textContent = el.textContent ?? '';
        clone.setAttribute(ADOPTED_HOST_STYLE_ATTR, '');
        adoptedStyles.appendChild(clone);
        return;
      }
      const linkClone = el.cloneNode(true) as Element;
      linkClone.setAttribute(ADOPTED_HOST_STYLE_ATTR, '');
      adoptedStyles.appendChild(linkClone);
    });

    // Staged in a fragment so the adopted pieces keep their host-document order
    // relative to each other while moving as one block to the front.
    shadowRoot.insertBefore(adoptedStyles, shadowRoot.firstChild);
  }

  /**
   * Box-model resets and :host defaults needed inside every shadow root.
   * These aren't part of Tailwind's compiled output but are required for
   * consistent rendering across browsers.
   *
   * Reuses the node a previous mount left behind, exactly as `injectStylesheet`
   * does in `@gears-frontx/mfes`' shadow utilities: a remount runs against a
   * shadow root that `createShadowRoot` handed back intact, and appending a
   * second copy would add one node per mount forever. Overwriting in place also
   * keeps the position this node earned on the first mount - behind the adopted
   * host block and behind the MFE's own CSS - which a remove-and-append would
   * not, since the container gains nodes between mounts.
   *
   * Looked up by attribute-selector form rather than `getElementById`, which
   * `ShadowRoot` has but `Element` does not, and this hook takes either.
   */
  private injectBaseResets(container: Element | ShadowRoot): void {
    const existing = container.querySelector<HTMLStyleElement>(
      `style[id="${BASE_RESETS_STYLE_ID}"]`
    );
    const style = existing ?? document.createElement('style');
    style.id = BASE_RESETS_STYLE_ID;
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
    if (!existing) {
      container.appendChild(style);
    }
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
