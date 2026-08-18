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
 * What this buys instead is a constraint, and it is worth stating plainly: the
 * rewrite is textual, not a parse, so it cannot tell a selector from the two
 * other places `:root` may legally appear. Inside a quoted value (a string, or
 * an attribute selector's value) it would rewrite text that is data, and inside
 * a feature query such as `@supports selector(:root)` it would rewrite the
 * condition being tested rather than a selector. The comment stripper has the
 * same blind spot in reverse: a quoted value containing a comment delimiter
 * would be eaten as prose.
 *
 * The pinned kit version satisfies the assumption. Every `:root` in its
 * `theme.css` sits either in plain selector position or in prose, and neither
 * a quoted value nor a feature query names it anywhere. Two things hold that:
 * the exact version pin in this package's `package.json`, and the tests beside
 * this file, which assert the real imported stylesheet comes back with no
 * `:root` left in it. A kit upgrade that introduces either context needs a real
 * CSS parser here, not a wider regex.
 *
 * @param css - Stylesheet source, minified or not
 */
export function anchorKitThemeOnShadowHost(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/:root\b/g, ':host');
}
