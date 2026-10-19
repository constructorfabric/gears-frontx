import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen } from '@testing-library/react';
import { ExternalLink } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';

import { declarationMap, extractRules } from '../../__test-utils__/css-rules';
import { VisuallyHidden } from './visually-hidden';
import styles from './visually-hidden.module.css';

afterEach(cleanup);

describe('VisuallyHidden', () => {
  it('renders a span whose text names its container', () => {
    render(
      <a href="/docs">
        <ExternalLink aria-hidden="true" />
        <VisuallyHidden>Open the docs</VisuallyHidden>
      </a>,
    );
    const link = screen.getByRole('link', { name: 'Open the docs' });
    const hidden = screen.getByText('Open the docs');
    expect(hidden.tagName).toBe('SPAN');
    expect(hidden.className).toContain(styles.visuallyHidden);
    expect(link.contains(hidden)).toBe(true);
  });

  it('swaps the element through render', () => {
    render(
      <table>
        <VisuallyHidden render={<caption />}>Members</VisuallyHidden>
        <tbody>
          <tr>
            <td>Ada</td>
          </tr>
        </tbody>
      </table>,
    );
    expect(screen.getByRole('table', { name: 'Members' })).toBeDefined();
    expect(screen.getByText('Members').tagName).toBe('CAPTION');
  });
});

/*
 * The visually hidden rule exists in several copies, because CSS Modules
 * share no class across files and a kit component must not depend on the
 * optional utilities.css: this module, the `sr-only` utility and the
 * internal `.srOnly` copies. They must stay the same rule.
 */
describe('visually hidden rule copies', () => {
  const componentsDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  function rule(file: string, selector: string) {
    const found = extractRules(readFileSync(file, 'utf8')).find(
      (candidate) => candidate.selector === selector,
    );
    return Object.fromEntries(declarationMap(found?.body ?? ''));
  }
  const reference = rule(join(componentsDir, 'visually-hidden', 'visually-hidden.module.css'), '.visuallyHidden');

  it('draws an absolutely positioned, one-pixel, clipped box', () => {
    expect(reference).toEqual({
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: '0',
      overflow: 'hidden',
      'clip-path': 'inset(50%)',
      'white-space': 'nowrap',
      border: '0',
    });
  });

  // Every module that carries its own copy, found rather than listed, so a
  // copy added later is checked too. A copy must use the `.srOnly` name,
  // as the existing ones do, to be found.
  const copies = readdirSync(componentsDir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.module.css'))
    .map((file) => join(componentsDir, file))
    .filter((file) => extractRules(readFileSync(file, 'utf8')).some((r) => r.selector === '.srOnly'));

  it('finds the internal copies', () => {
    expect(copies.length).toBeGreaterThanOrEqual(5);
  });

  it.each([[join(componentsDir, '..', 'styles', 'utilities.css'), '.sr-only'] as const, ...copies.map((file) => [file, '.srOnly'] as const)])(
    'matches the copy in %s',
    (file, selector) => {
      expect(rule(file, selector)).toEqual(reference);
    },
  );
});
