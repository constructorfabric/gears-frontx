import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { declarationMap, extractRules } from '../../__test-utils__/css-rules';
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderLeading,
  PageHeaderMeta,
  PageHeaderTitle,
} from './page-header';
import styles from './page-header.module.css';

afterEach(cleanup);

function renderPageHeader() {
  return render(
    <PageHeader data-testid="root">
      <PageHeaderLeading>
        <button type="button">Back to projects</button>
      </PageHeaderLeading>
      <PageHeaderContent data-testid="content">
        <PageHeaderEyebrow>Acme Corporation</PageHeaderEyebrow>
        <PageHeaderTitle>Security Scanner</PageHeaderTitle>
        <PageHeaderMeta>
          <span>Platform</span>
        </PageHeaderMeta>
        <PageHeaderDescription>Surface actionable code risks.</PageHeaderDescription>
      </PageHeaderContent>
      <PageHeaderActions>
        <button type="button">New project</button>
      </PageHeaderActions>
    </PageHeader>,
  );
}

describe('PageHeader', () => {
  it('renders every part with its kit class', () => {
    renderPageHeader();
    expect(screen.getByTestId('root').className).toContain(styles.pageHeader);
    expect(screen.getByRole('button', { name: 'Back to projects' }).parentElement?.className).toContain(
      styles.pageHeaderLeading,
    );
    expect(screen.getByTestId('content').className).toContain(styles.pageHeaderContent);
    expect(screen.getByText('Acme Corporation').className).toContain(styles.pageHeaderEyebrow);
    expect(screen.getByText('Security Scanner').className).toContain(styles.pageHeaderTitle);
    expect(screen.getByText('Platform').parentElement?.className).toContain(styles.pageHeaderMeta);
    expect(screen.getByText('Surface actionable code risks.').className).toContain(
      styles.pageHeaderDescription,
    );
    expect(screen.getByRole('button', { name: 'New project' }).parentElement?.className).toContain(
      styles.pageHeaderActions,
    );
  });

  it('renders the root as a header element', () => {
    renderPageHeader();
    expect(screen.getByTestId('root')).toHaveProperty('tagName', 'HEADER');
  });

  it('renders the title as the page h1 unless told otherwise', () => {
    renderPageHeader();
    expect(screen.getByRole('heading', { level: 1, name: 'Security Scanner' })).toBeDefined();
  });

  it('renders the title at the level its render element names, keeping the kit class', () => {
    render(<PageHeaderTitle render={<h2 />}>Workspaces</PageHeaderTitle>);
    const heading = screen.getByRole('heading', { level: 2, name: 'Workspaces' });
    expect(heading.className).toContain(styles.pageHeaderTitle);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('defaults the root to the default size and switches to sm and lg', () => {
    const { rerender } = render(<PageHeader data-testid="root" />);
    expect(screen.getByTestId('root').className).toContain(styles.sizeDefault);
    rerender(<PageHeader data-testid="root" size="sm" />);
    expect(screen.getByTestId('root').className).toContain(styles.sizeSm);
    rerender(<PageHeader data-testid="root" size="lg" />);
    expect(screen.getByTestId('root').className).toContain(styles.sizeLg);
  });

  it('draws the rule by default and hides it only when border is false', () => {
    const { rerender } = render(<PageHeader data-testid="root" />);
    expect(screen.getByTestId('root').className).not.toContain(styles.borderHidden);
    rerender(<PageHeader data-testid="root" border={false} />);
    expect(screen.getByTestId('root').className).toContain(styles.borderHidden);
  });

  it('defaults the title to the heading typography and switches to display', () => {
    const { rerender } = render(<PageHeaderTitle>Projects</PageHeaderTitle>);
    expect(screen.getByRole('heading').className).toContain(styles.typographyHeading);
    rerender(<PageHeaderTitle typography="display">Projects</PageHeaderTitle>);
    expect(screen.getByRole('heading').className).toContain(styles.typographyDisplay);
    expect(screen.getByRole('heading').className).not.toContain(styles.typographyHeading);
  });

  it('does not leak the kit props to the DOM as attributes', () => {
    render(
      <PageHeader data-testid="root" size="lg" border={false}>
        <PageHeaderTitle typography="display">Projects</PageHeaderTitle>
      </PageHeader>,
    );
    const root = screen.getByTestId('root');
    expect(root.hasAttribute('size')).toBe(false);
    expect(root.hasAttribute('border')).toBe(false);
    expect(screen.getByRole('heading').hasAttribute('typography')).toBe(false);
  });

  it.each([
    ['PageHeader', PageHeader, styles.pageHeader],
    ['PageHeaderLeading', PageHeaderLeading, styles.pageHeaderLeading],
    ['PageHeaderContent', PageHeaderContent, styles.pageHeaderContent],
    ['PageHeaderEyebrow', PageHeaderEyebrow, styles.pageHeaderEyebrow],
    ['PageHeaderTitle', PageHeaderTitle, styles.pageHeaderTitle],
    ['PageHeaderMeta', PageHeaderMeta, styles.pageHeaderMeta],
    ['PageHeaderDescription', PageHeaderDescription, styles.pageHeaderDescription],
    ['PageHeaderActions', PageHeaderActions, styles.pageHeaderActions],
  ] as const)('merges a consumer className on %s without dropping the kit class', (_name, Part, kitClass) => {
    render(<Part data-testid="part" className="consumer" />);
    const part = screen.getByTestId('part');
    expect(part.className).toContain(kitClass);
    expect(part.className).toContain('consumer');
  });
});

/*
 * The drawn geometry of the page header, pinned against the stylesheet:
 * jsdom lays nothing out, so the declarations are what a
 * test can hold. Each assertion is one a plausible edit would break - a
 * rule dropped instead of hidden, a gap "corrected" to one value on both
 * sides of the content, a metric taken off the type ramp.
 */
describe('PageHeader drawn geometry', () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'page-header.module.css'), 'utf8');
  const containerStart = css.indexOf('@container');
  const wide = extractRules(containerStart === -1 ? css : css.slice(0, containerStart));
  const narrow = containerStart === -1 ? [] : extractRules(css.slice(containerStart));

  function declared(rules: typeof wide, selector: string, prop: string) {
    const rule = rules.find((candidate) => candidate.selector === selector);
    return rule ? declarationMap(rule.body).get(prop) : undefined;
  }

  it('holds the drawn 56, 64 and 80 as minimum heights that include the rule', () => {
    expect(declared(wide, '.sizeSm', 'min-height')).toBe('3.5rem');
    expect(declared(wide, '.sizeDefault', 'min-height')).toBe('4rem');
    expect(declared(wide, '.sizeLg', 'min-height')).toBe('5rem');
    expect(declared(wide, '.pageHeader', 'box-sizing')).toBe('border-box');
  });

  it('hides the rule by painting it transparent, so the height does not change', () => {
    expect(declared(wide, '.pageHeader', 'border-bottom')).toBe('var(--border-width) solid var(--border)');
    expect(declared(wide, '.borderHidden', 'border-bottom-color')).toBe('transparent');
    expect(declared(wide, '.borderHidden', 'border-bottom')).toBeUndefined();
    expect(declared(wide, '.borderHidden', 'border-bottom-width')).toBeUndefined();
  });

  it('insets its sides by the consumer hook, falling back to the drawn 24', () => {
    // declarationMap's property pattern stops at the private form's
    // underscore, so the resolving declaration is read off the rule body.
    const root = wide.find((candidate) => candidate.selector === '.pageHeader');
    expect(root?.body).toContain('--_page-header-inset: var(--page-header-inset, var(--space-6));');
    expect(declared(wide, '.pageHeader', 'padding-inline')).toBe('var(--_page-header-inset)');
  });

  it('puts 16 after the leading control and 24 before the actions', () => {
    expect(declared(wide, '.pageHeader', 'column-gap')).toBe('var(--space-4)');
    expect(declared(wide, '.pageHeaderActions', 'margin-inline-start')).toBe('var(--space-2)');
  });

  it('spaces the content beside the title 20 apart and the actions 8 apart', () => {
    expect(declared(wide, '.pageHeaderContent', 'column-gap')).toBe('var(--space-5)');
    expect(declared(wide, '.pageHeaderMeta', 'gap')).toBe('var(--space-5)');
    expect(declared(wide, '.pageHeaderActions', 'gap')).toBe('var(--space-2)');
  });

  it('sets the title on the heading-1 and display roles of the type ramp', () => {
    expect(declared(wide, '.typographyHeading', 'font-size')).toBe('var(--text-heading-1-size)');
    expect(declared(wide, '.typographyHeading', 'line-height')).toBe('var(--text-heading-1-line-height)');
    expect(declared(wide, '.typographyDisplay', 'font-size')).toBe('var(--text-display-size)');
    expect(declared(wide, '.typographyDisplay', 'line-height')).toBe('var(--text-display-line-height)');
  });

  it('clears the heading margins a browser gives an h1', () => {
    expect(declared(wide, '.pageHeaderTitle', 'margin')).toBe('0');
  });

  it('sets the eyebrow and the description on the meta role, 4 from the title', () => {
    expect(declared(wide, '.pageHeaderEyebrow', 'font-size')).toBe('var(--text-meta-size)');
    expect(declared(wide, '.pageHeaderEyebrow', 'margin-bottom')).toBe('var(--space-1)');
    expect(declared(wide, '.pageHeaderDescription', 'font-size')).toBe('var(--text-meta-size)');
    expect(declared(wide, '.pageHeaderDescription', 'margin-top')).toBe('var(--space-1)');
  });

  it('sizes the title and meta columns to their content and gives the rest of the row to a flexible column', () => {
    // A 1fr column for the meta collapses to zero beside a title wider than
    // the row, and its content then paints over the actions. Without the
    // flexible third column, an eyebrow or a description wider than the
    // title and the meta widens their columns and moves the meta away from
    // the title.
    expect(declared(wide, '.pageHeaderContent', 'grid-template-columns')).toBe(
      'minmax(0, max-content) minmax(0, max-content) minmax(0, 1fr)',
    );
  });

  it('keeps 4 above and below its content, so a header taller than its minimum does not touch its edges', () => {
    expect(declared(wide, '.pageHeader', 'padding-block')).toBe('var(--space-1)');
  });

  it("draws an eyebrow link's focus ring inside the link, where the eyebrow's clipping cannot cut it", () => {
    expect(declared(wide, '.pageHeaderEyebrow', 'overflow')).toBe('hidden');
    expect(declared(wide, '.pageHeaderEyebrow a:focus-visible', 'outline')).toBe(
      'var(--border-width-focus) solid var(--ring)',
    );
    expect(declared(wide, '.pageHeaderEyebrow a:focus-visible', 'outline-offset')).toBe(
      'calc(-1 * var(--border-width-focus))',
    );
  });

  it('wraps the actions onto further lines when they do not fit', () => {
    expect(declared(wide, '.pageHeaderActions', 'flex-wrap')).toBe('wrap');
  });

  it('places the content beside the title in the wide layout', () => {
    expect(declared(wide, '.pageHeaderContent', 'grid-template-areas')).toBe(
      '"eyebrow eyebrow eyebrow" "title meta ." "description description description"',
    );
  });

  it('moves the content beside the title and the actions onto rows of their own below 1024px', () => {
    expect(css).toContain('@container page-header (width < 64rem)');
    expect(declared(narrow, '.pageHeaderContent', 'grid-template-areas')).toBe(
      '"eyebrow" "title" "description" "meta"',
    );
    expect(declared(narrow, '.pageHeaderActions', 'flex-basis')).toBe('100%');
    expect(declared(narrow, '.pageHeaderActions', 'margin-inline-start')).toBe('0');
  });
});
