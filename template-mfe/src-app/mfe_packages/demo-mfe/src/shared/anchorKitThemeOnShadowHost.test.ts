import { describe, expect, it } from 'vitest';
import kitThemeCss from '@gears-frontx/ui-kit/theme.css?inline';
import { anchorKitThemeOnShadowHost } from './anchorKitThemeOnShadowHost';

// The two shapes the kit's theme.css reaches this code in: verbatim source in
// dev and tests, one minified line in a production build.
const EXPANDED_THEME_CSS = `/*
 * Tokens declared on :root, per the comment above.
 */
:root {
  --radius-md: 0.5rem;
}

:root,
[data-theme='light'] {
  --background: #f8fafc;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --background: #090b10;
  }
}
`;

const MINIFIED_THEME_CSS =
  ':root{--radius-md: 0.5rem}:root,[data-theme=light]{--background: #f8fafc}' +
  '@media (prefers-color-scheme: dark){:root:not([data-theme=light]){--background: #090b10}}';

describe('anchorKitThemeOnShadowHost', () => {
  it('rewrites every root selector of an expanded stylesheet, including the one behind a comment', () => {
    const anchored = anchorKitThemeOnShadowHost(EXPANDED_THEME_CSS);

    expect(anchored).not.toContain(':root');
    expect(anchored.match(/:host/g)).toHaveLength(3);
  });

  it('rewrites every root selector of a minified stylesheet, where no selector starts a line', () => {
    const anchored = anchorKitThemeOnShadowHost(MINIFIED_THEME_CSS);

    expect(anchored).not.toContain(':root');
    expect(anchored.match(/:host/g)).toHaveLength(3);
  });

  it('leaves the theme scopes the kit selects on untouched, so an explicit scope still overrides the host', () => {
    const anchored = anchorKitThemeOnShadowHost(MINIFIED_THEME_CSS);

    expect(anchored).toContain(':host,[data-theme=light]');
    expect(anchored).toContain(':host:not([data-theme=light])');
  });

  // A selector list may put :root anywhere, not only first; a rewrite that
  // recognised selector positions would drop this one and leave the rule
  // matching nothing in a shadow tree.
  it('rewrites a root selector that trails another selector in the same list', () => {
    const anchored = anchorKitThemeOnShadowHost("[data-theme='light'],:root{--background:#fff}");

    expect(anchored).toBe("[data-theme='light'],:host{--background:#fff}");
  });

  // The module rewrites once at load and every mount appends the same text, so
  // a second application must be a no-op. If it ever stopped being one, the
  // rewrite would be destroying something on each pass rather than converging.
  it('is idempotent, so a second application changes nothing', () => {
    for (const source of [EXPANDED_THEME_CSS, MINIFIED_THEME_CSS, kitThemeCss]) {
      const once = anchorKitThemeOnShadowHost(source);

      expect(anchorKitThemeOnShadowHost(once)).toBe(once);
    }
  });

  // The assertions above run on hand-written fixtures. This one runs on the
  // stylesheet the lifecycle actually imports, which is what the pinned kit
  // version has to keep satisfying: not one `:root` may survive, because each
  // survivor is a rule that silently matches nothing in a shadow tree.
  it('leaves no root selector in the kit stylesheet it is actually applied to', () => {
    expect(kitThemeCss).toContain(':root');

    const anchored = anchorKitThemeOnShadowHost(kitThemeCss);

    expect(anchored).not.toContain(':root');
    expect(anchored).toContain(':host');
  });

  // A documented limitation, pinned rather than fixed: the rewrite is textual,
  // so a `:root` inside a quoted value is data it cannot recognise, and it is
  // rewritten like any other. The pinned kit stylesheet contains no such value
  // (the test above is what checks that), so no parser is warranted here. This
  // case exists so that changing the transform is a deliberate act: whoever
  // makes the rewrite selector-aware will see this expectation fail and can
  // then update it on purpose.
  it('rewrites a root inside a quoted value too, which is the known limitation', () => {
    const anchored = anchorKitThemeOnShadowHost(':host::after{content:":root"}');

    expect(anchored).toBe(':host::after{content:":host"}');
  });
});
