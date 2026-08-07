/**
 * Re-anchoring of `@gears-frontx/ui-kit`'s theme tokens for a shadow root.
 *
 * The kit declares its design tokens on `:root` because its intended consumer
 * is a document. An MFE is not one: it renders inside a shadow root, whose root
 * node is a `DocumentFragment`, and `:root` matches nothing in a shadow tree at
 * all. A stylesheet loaded there unchanged delivers no tokens, and every kit
 * component paints from unresolved `var()` references.
 */

/**
 * Rewrite every `:root` selector in a stylesheet to `:host`.
 *
 * Comments are stripped first, and only first: `:root` appears in the kit's
 * prose as well as its selectors, and once the prose is gone every remaining
 * occurrence is a selector. Recognising selector *positions* instead — anchored
 * on a preceding `{`, `}` or start of input — buys nothing over replacing them
 * all and loses `[data-theme='light'],:root { … }`, which is the same
 * silent-partial-rewrite this function exists to avoid.
 *
 * @param css - Stylesheet source, minified or not
 */
export function anchorKitThemeOnShadowHost(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/:root\b/g, ':host');
}
