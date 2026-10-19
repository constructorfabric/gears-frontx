import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { declarationMap, declaredIn, extractRules } from '../../__test-utils__/css-rules';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card';
import styles from './card.module.css';

afterEach(cleanup);

function renderCard() {
  return render(
    <Card data-testid="card">
      <CardHeader>
        <CardTitle>Team plan</CardTitle>
        <CardDescription>Billed monthly</CardDescription>
        <CardAction>
          <button type="button">Manage</button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p>5 seats in use</p>
      </CardContent>
      <CardFooter>
        <button type="button">Upgrade</button>
      </CardFooter>
    </Card>,
  );
}

describe('Card', () => {
  it('renders every part with its kit class', () => {
    renderCard();
    expect(screen.getByTestId('card').className).toContain(styles.card);
    expect(screen.getByText('Team plan').className).toContain(styles.cardTitle);
    expect(screen.getByText('Billed monthly').className).toContain(styles.cardDescription);
    expect(screen.getByText('5 seats in use').parentElement?.className).toContain(
      styles.cardContent,
    );
    expect(screen.getByRole('button', { name: 'Manage' }).parentElement?.className).toContain(
      styles.cardAction,
    );
    expect(screen.getByRole('button', { name: 'Upgrade' }).parentElement?.className).toContain(
      styles.cardFooter,
    );
  });

  it('defaults to the default size and switches to sm', () => {
    const { rerender } = render(<Card data-testid="card" />);
    expect(screen.getByTestId('card').className).toContain(styles.sizeDefault);
    rerender(<Card data-testid="card" size="sm" />);
    expect(screen.getByTestId('card').className).toContain(styles.sizeSm);
  });

  it('merges a consumer className without dropping the kit class', () => {
    render(<Card data-testid="card" className="consumer" />);
    const card = screen.getByTestId('card');
    expect(card.className).toContain(styles.card);
    expect(card.className).toContain('consumer');
  });

  it('does not leak the size prop to the DOM as an attribute', () => {
    render(<Card data-testid="card" size="sm" />);
    expect(screen.getByTestId('card').hasAttribute('size')).toBe(false);
  });

  it.each([
    ['CardHeader', CardHeader, styles.cardHeader],
    ['CardTitle', CardTitle, styles.cardTitle],
    ['CardDescription', CardDescription, styles.cardDescription],
    ['CardAction', CardAction, styles.cardAction],
    ['CardContent', CardContent, styles.cardContent],
    ['CardFooter', CardFooter, styles.cardFooter],
  ] as const)('merges a consumer className on %s without dropping the kit class', (_name, Part, kitClass) => {
    render(<Part data-testid="part" className="consumer" />);
    const part = screen.getByTestId('part');
    expect(part.className).toContain(kitClass);
    expect(part.className).toContain('consumer');
  });

  it('places CardHeader in the DOM as the direct parent of CardAction and CardDescription', () => {
    renderCard();
    const header = screen.getByText('Team plan').parentElement;
    expect(header?.className).toContain(styles.cardHeader);
    expect(screen.getByText('Billed monthly').parentElement).toBe(header);
    expect(screen.getByRole('button', { name: 'Manage' }).parentElement?.parentElement).toBe(
      header,
    );
  });

  it('forwards native div props such as onClick to any part', () => {
    const onClick = vi.fn();
    render(
      <Card>
        <CardContent onClick={onClick}>Click me</CardContent>
      </Card>,
    );
    fireEvent.click(screen.getByText('Click me'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

/*
 * The panel typography axis. Both steps land on roles the ramp already
 * names, so what is worth guarding is that the classes reach the parts and
 * that `panel` actually outranks the size axis's own title step, which is
 * a same-specificity rule earlier in the file.
 */
describe('Card panel typography', () => {
  const rules = extractRules(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'card.module.css'), 'utf8'),
  );

  function declared(selector: string, prop: string) {
    const rule = rules.find(
      (candidate) => candidate.selector.replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ').trim() === selector,
    );
    return rule ? declarationMap(rule.body).get(prop) : undefined;
  }

  it('renders typography="default" and an omitted typography identically', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle typography="default">Explicit</CardTitle>
          <CardDescription typography="default">Explicit description</CardDescription>
        </CardHeader>
        <CardHeader>
          <CardTitle>Omitted</CardTitle>
          <CardDescription>Omitted description</CardDescription>
        </CardHeader>
      </Card>,
    );
    expect(screen.getByText('Omitted').className).toBe(screen.getByText('Explicit').className);
    expect(screen.getByText('Omitted description').className).toBe(
      screen.getByText('Explicit description').className,
    );
  });

  it('applies the panel class to both parts', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle typography="panel">Panel</CardTitle>
          <CardDescription typography="panel">Panel description</CardDescription>
        </CardHeader>
      </Card>,
    );
    expect(screen.getByText('Panel').className).toContain(styles.typographyPanel);
    expect(screen.getByText('Panel description').className).toContain(styles.typographyPanel);
  });

  it('puts both panel steps on roles the ramp already names', () => {
    const title = '.card .cardTitle.typographyPanel,.cardTitle.typographyPanel';
    expect(declared(title, 'font-size')).toBe('var(--text-body-size)');
    expect(declared(title, 'line-height')).toBe('var(--text-body-line-height)');
    expect(declared(title, 'font-weight')).toBe('var(--text-heading-2-weight)');
    expect(declared(title, 'letter-spacing')).toBe('normal');
    expect(declared('.cardDescription.typographyPanel', 'font-size')).toBe('var(--text-meta-size)');
    expect(declared('.cardDescription.typographyPanel', 'line-height')).toBe(
      'var(--text-meta-line-height)',
    );
    expect(declared('.cardDescription.typographyPanel', 'font-weight')).toBe(
      'var(--text-meta-weight)',
    );
  });
});

describe('Card render', () => {
  it('renders the same div with the same classes and no extra attributes without render', () => {
    render(
      <Card data-testid="card">
        <CardTitle data-testid="title">Team plan</CardTitle>
      </Card>,
    );
    const card = screen.getByTestId('card');
    expect(card.tagName).toBe('DIV');
    expect(card.className).not.toContain(styles.interactive);
    expect(card.getAttributeNames().sort()).toEqual(['class', 'data-testid']);
    const title = screen.getByTestId('title');
    expect(title.tagName).toBe('DIV');
    expect(title.className).not.toContain(styles.renderedTitle);
    expect(title.getAttributeNames().sort()).toEqual(['class', 'data-testid']);
  });

  it('makes the whole card a link with the interactive class', () => {
    render(
      <Card render={<a href="/guides/setup" />}>
        <CardHeader>
          <CardTitle render={<h3 />}>Setup guide</CardTitle>
        </CardHeader>
      </Card>,
    );
    const link = screen.getByRole('link', { name: 'Setup guide' });
    expect(link.getAttribute('href')).toBe('/guides/setup');
    expect(link.className).toContain(styles.card);
    expect(link.className).toContain(styles.interactive);
    const heading = screen.getByRole('heading', { level: 3, name: 'Setup guide' });
    expect(heading.className).toContain(styles.cardTitle);
    expect(heading.className).toContain(styles.renderedTitle);
  });
});

describe('Card panel variant', () => {
  it('applies the panel class and keeps the default class otherwise', () => {
    const { rerender } = render(<Card data-testid="card" />);
    expect(screen.getByTestId('card').className).toContain(styles.variantDefault);
    rerender(<Card data-testid="card" variant="panel" />);
    expect(screen.getByTestId('card').className).toContain(styles.variantPanel);
  });

  it('draws the lifted frame with no inset of its own', () => {
    const declaredRule = declaredIn(import.meta.url, 'card.module.css');
    expect(declaredRule('.card.variantPanel', 'border-radius')).toBe('var(--radius-2xl)');
    expect(declaredRule('.card.variantPanel', 'box-shadow')).toBe('var(--panel-shadow)');
    expect(declaredRule('.card.variantPanel', 'padding')).toBe('0');
    expect(declaredRule('.card.variantPanel', 'gap')).toBe('0');
  });
});

// jsdom does no layout, so the states a link card draws are read from the module source.
describe('Card render drawn rules', () => {
  const declaredRule = declaredIn(import.meta.url, 'card.module.css');

  it('resets the UA link and button styling at zero specificity', () => {
    expect(declaredRule(':where(.interactive)', 'text-decoration')).toBe('none');
    expect(declaredRule(':where(.interactive)', 'font')).toBe('inherit');
  });

  it('gives only a link or button root the pointer and drops the UA outline only there', () => {
    expect(declaredRule(':where(.interactive)', 'cursor')).toBeUndefined();
    expect(declaredRule(':where(.interactive)', 'outline')).toBeUndefined();
    expect(declaredRule('.interactive:where(a[href], button)', 'cursor')).toBe('pointer');
    expect(declaredRule('.interactive:where(a[href], button)', 'outline')).toBe('none');
  });

  it('draws the hover border and the focus ring only on a link or button root', () => {
    expect(declaredRule('.interactive:where(a[href], button):hover', 'border-color')).toBe(
      'var(--ring)',
    );
    expect(declaredRule('.interactive:where(a[href], button):focus-visible', 'box-shadow')).toBe(
      'inset 0 0 0 var(--ring-inset) var(--ring)',
    );
  });

  it('resets a rendered title to the look of the div', () => {
    expect(declaredRule(':where(.renderedTitle)', 'margin')).toBe('0');
    expect(declaredRule(':where(.renderedTitle)', 'font-size')).toBe('inherit');
  });
});
