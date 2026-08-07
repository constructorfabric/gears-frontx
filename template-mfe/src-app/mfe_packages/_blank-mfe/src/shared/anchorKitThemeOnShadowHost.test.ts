import { describe, expect, it } from 'vitest';
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
});
