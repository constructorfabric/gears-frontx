import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { declarationMap, extractRules } from '../../__test-utils__/css-rules';
import {
  Empty,
  EmptyActions,
  EmptyContent,
  EmptyDescription,
  EmptyDetail,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from './empty';
import styles from './empty.module.css';

afterEach(cleanup);

function renderEmpty() {
  return render(
    <Empty data-testid="empty">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <svg data-testid="icon" />
        </EmptyMedia>
        <EmptyTitle>No results</EmptyTitle>
        <EmptyDescription>Try a different search.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <button type="button">Clear filters</button>
      </EmptyContent>
    </Empty>,
  );
}

describe('Empty', () => {
  it('renders every part with its kit class', () => {
    renderEmpty();
    expect(screen.getByTestId('empty').className).toContain(styles.empty);
    expect(screen.getByText('No results').className).toContain(styles.emptyTitle);
    expect(screen.getByText('Try a different search.').className).toContain(
      styles.emptyDescription,
    );
    expect(screen.getByRole('button', { name: 'Clear filters' }).parentElement?.className).toContain(
      styles.emptyContent,
    );
  });

  it('defaults EmptyMedia to the default variant and switches to icon', () => {
    const { rerender } = render(<EmptyMedia data-testid="media" />);
    expect(screen.getByTestId('media').className).toContain(styles.variantDefault);
    rerender(<EmptyMedia data-testid="media" variant="icon" />);
    expect(screen.getByTestId('media').className).toContain(styles.variantIcon);
  });

  it('merges a consumer className without dropping the kit class', () => {
    render(<Empty data-testid="empty" className="consumer" />);
    const empty = screen.getByTestId('empty');
    expect(empty.className).toContain(styles.empty);
    expect(empty.className).toContain('consumer');
  });

  it('does not leak the variant prop to the DOM as an attribute', () => {
    render(<EmptyMedia data-testid="media" variant="icon" />);
    expect(screen.getByTestId('media').hasAttribute('variant')).toBe(false);
  });

  it.each([
    ['EmptyHeader', EmptyHeader, styles.emptyHeader],
    ['EmptyTitle', EmptyTitle, styles.emptyTitle],
    ['EmptyDescription', EmptyDescription, styles.emptyDescription],
    ['EmptyContent', EmptyContent, styles.emptyContent],
    ['EmptyDetail', EmptyDetail, styles.emptyDetail],
    ['EmptyActions', EmptyActions, styles.emptyActions],
  ] as const)('merges a consumer className on %s without dropping the kit class', (_name, Part, kitClass) => {
    render(<Part data-testid="part" className="consumer" />);
    const part = screen.getByTestId('part');
    expect(part.className).toContain(kitClass);
    expect(part.className).toContain('consumer');
  });

  it('renders EmptyDescription as a div, matching upstream despite its own p-typed props', () => {
    render(<EmptyDescription data-testid="desc">text</EmptyDescription>);
    expect(screen.getByTestId('desc')).toHaveProperty('tagName', 'DIV');
  });
});

/*
 * The two added slots. Their whole contract is where the drawn distances
 * come from: the detail's 16 is the header's gap plus its own margin, and
 * the actions row has no margin at all because the root's gap is already
 * the drawn 24. Both are pinned against the stylesheet, since a margin
 * added "to reach 24" is exactly the change that would silently double it.
 */
describe('Empty slots', () => {
  const rules = extractRules(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'empty.module.css'), 'utf8'),
  );

  function declared(selector: string, prop: string) {
    const rule = rules.find((candidate) => candidate.selector === selector);
    return rule ? declarationMap(rule.body).get(prop) : undefined;
  }

  it('renders the detail inside the header and the actions at the foot', () => {
    render(
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No results</EmptyTitle>
          <EmptyDetail>3 filters applied</EmptyDetail>
        </EmptyHeader>
        <EmptyActions>
          <button type="button">Clear filters</button>
        </EmptyActions>
      </Empty>,
    );
    const detail = screen.getByText('3 filters applied');
    expect(detail.className).toContain(styles.emptyDetail);
    expect(detail.parentElement?.className).toContain(styles.emptyHeader);
    expect(screen.getByRole('button', { name: 'Clear filters' }).parentElement?.className).toContain(
      styles.emptyActions,
    );
  });

  it('puts the detail 16 under the description and adds nothing above the actions', () => {
    expect(declared('.emptyHeader', 'gap')).toBe('var(--space-2)');
    expect(declared('.emptyHeader .emptyDetail', 'margin-top')).toBe('var(--space-2)');
    expect(declared('.emptyDetail', 'margin-top')).toBeUndefined();
    expect(declared('.empty', 'gap')).toBe('var(--space-6)');
    expect(declared('.emptyActions', 'margin-top')).toBeUndefined();
    expect(declared('.emptyActions', 'gap')).toBe('var(--space-2)');
  });

  it('fills the icon plate from the selection role, not the muted one', () => {
    expect(declared('.variantIcon', 'background-color')).toBe('var(--secondary)');
  });
});

/*
 * The drawn geometry, taken exactly from the catalogue per the kit's
 * "values exactly the primary source" rule: no kit-side correction of a
 * drawn number, even where the kit's own prior value (40px plate, 48px
 * root padding) had its own reasoning in place.
 */
describe('Empty drawn geometry', () => {
  const rules = extractRules(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'empty.module.css'), 'utf8'),
  );

  function declared(selector: string, prop: string) {
    const rule = rules.find((candidate) => candidate.selector === selector);
    return rule ? declarationMap(rule.body).get(prop) : undefined;
  }

  it('caps the root card at the drawn 512 and insets it by the drawn 32', () => {
    expect(declared('.empty', 'max-width')).toBe('32rem');
    expect(declared('.empty', 'padding')).toBe('var(--space-8)');
  });

  it('sizes the icon plate at the drawn 48, not the earlier 40', () => {
    expect(declared('.variantIcon', 'width')).toBe('3rem');
    expect(declared('.variantIcon', 'height')).toBe('3rem');
  });

  it('sets the title at the drawn 18/24', () => {
    expect(declared('.emptyTitle', 'font-size')).toBe('1.125rem');
    expect(declared('.emptyTitle', 'line-height')).toBe('1.5rem');
  });

  it('keeps the description at the drawn 14/20, the kit\'s own Body role', () => {
    expect(declared('.emptyDescription', 'font-size')).toBe('var(--text-body-size)');
    expect(declared('.emptyDescription', 'line-height')).toBe('var(--text-body-line-height)');
  });
});
