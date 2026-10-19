// @cpt-algo:cpt-frontx-algo-mfe-host-communication-host-theme:p2
import { describe, expect, it } from 'vitest';
import { injectCssVariables } from '..';

describe('injectCssVariables', () => {
  it('writes the host selector when no appearance scope is supplied', () => {
    const root = document.createElement('div').attachShadow({ mode: 'open' });

    injectCssVariables(root, { '--accent': 'blue' });

    expect(root.getElementById('__frontx-css-variables__')?.textContent).toBe(':host {\n  --accent: blue;\n}');
  });

  it('writes the scoped host and repeated attribute selectors when appearance is supplied', () => {
    const root = document.createElement('div').attachShadow({ mode: 'open' });

    injectCssVariables(root, { '--accent': 'blue' }, { attribute: 'data-appearance', value: 'dark' });

    expect(root.getElementById('__frontx-css-variables__')?.textContent).toBe(
      ":host([data-appearance='dark']), [data-appearance='dark'][data-appearance='dark'] {\n  --accent: blue;\n}"
    );
  });
});
