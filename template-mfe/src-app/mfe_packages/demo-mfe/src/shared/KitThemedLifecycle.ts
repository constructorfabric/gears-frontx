/**
 * Lifecycle base for demo-mfe screens built from `@gears-frontx/ui-kit`.
 *
 * Three of this package's five entries render kit components and therefore
 * need the kit's design tokens inside their own shadow root; they extend this
 * class instead of `ThemeAwareReactLifecycle` directly. The other two —
 * `lifecycle-theme` and `lifecycle-widgets-host` — deliberately do not: they
 * paint from the shell's Tailwind colour utilities, which read the same token
 * names as HSL triplets and stop resolving wherever the kit's tokens land. The
 * two grammars coexist only by never sharing a shadow root.
 */

import { ThemeAwareReactLifecycle } from '@gears-frontx/react';
import kitThemeCss from '@gears-frontx/ui-kit/theme.css?inline';
import { anchorKitThemeOnShadowHost } from './anchorKitThemeOnShadowHost';

/**
 * `@gears-frontx/ui-kit`'s design tokens, scoped to a shadow root.
 *
 * Rewritten once at module load rather than per mount: the source never
 * changes, and every mounted instance appends the same text.
 *
 * The alternative — loading `theme.css` into the host document instead — is
 * rejected on purpose: the shell declares the same token names as HSL triplets
 * for Tailwind (`hsl(var(--background))`), so kit values at document level
 * would invalidate every colour utility in the shell and in every other MFE.
 * Keeping the kit's tokens inside a shadow root is what lets the two grammars
 * coexist.
 */
const kitThemeCssForShadowRoot = anchorKitThemeOnShadowHost(kitThemeCss);

/**
 * A `ThemeAwareReactLifecycle` whose shadow root carries the kit's tokens.
 */
export abstract class KitThemedLifecycle extends ThemeAwareReactLifecycle {
  /**
   * The base class adopts the host document's stylesheets into the shadow root;
   * the kit's tokens are not among them, and this is the hook the base class
   * documents for exactly that gap.
   *
   * These tokens do collide with the base resets the same base class injects:
   * `injectBaseResets` paints `:host` with `hsl(var(--foreground))` and
   * `hsl(var(--background))`, written for the shell's HSL triplets, and the kit
   * declares those same names as complete colours on the same `:host`, so both
   * declarations resolve to `hsl(#f6f7f9)` and drop. Nothing shows through as
   * long as the screen root paints itself, which every kit-themed screen here
   * does through its own `.screen` rule; a screen that leaves part of the host
   * uncovered has to paint the host itself.
   */
  protected override initializeStyles(container: Element | ShadowRoot): void {
    const style = document.createElement('style');
    style.textContent = kitThemeCssForShadowRoot;
    container.appendChild(style);
  }
}
