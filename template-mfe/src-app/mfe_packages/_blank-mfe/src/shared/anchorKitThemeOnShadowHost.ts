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
 * Comments are stripped first, which is what lets one anchor set cover both
 * shapes the stylesheet arrives in: Vite hands over the source verbatim in dev
 * and tests, where a `:root` rule follows a comment block, and a single
 * minified line in a production build, where the same rule follows the previous
 * rule's `}`. A line-anchored rewrite passes on the first and silently leaves
 * all but the first selector behind on the second.
 *
 * @param css - Stylesheet source, minified or not
 */
export function anchorKitThemeOnShadowHost(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[{}])(\s*):root\b/g, '$1$2:host');
}
