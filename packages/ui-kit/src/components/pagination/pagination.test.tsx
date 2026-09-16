import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { declarationMap, extractRules } from '../../__test-utils__/css-rules';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from './pagination';
import paginationStyles from './pagination.module.css';

afterEach(cleanup);

describe('Pagination', () => {
  it('renders a nav labelled "pagination"', () => {
    render(<Pagination />);
    expect(screen.getByRole('navigation', { name: 'pagination' })).toHaveProperty('tagName', 'NAV');
  });

  it('renders the content as an unordered list', () => {
    render(
      <PaginationContent>
        <PaginationItem>1</PaginationItem>
      </PaginationContent>,
    );
    expect(screen.getByRole('list')).toHaveProperty('tagName', 'UL');
  });

  it('renders a link with its own class and a square footprint by default', () => {
    render(<PaginationLink href="#2">2</PaginationLink>);
    const link = screen.getByRole('link', { name: '2' });
    expect(link.className).toContain(paginationStyles.link);
    expect(link.className).toContain(paginationStyles.square);
    expect(link.hasAttribute('aria-current')).toBe(false);
    expect(link.hasAttribute('data-active')).toBe(false);
  });

  it('marks the active page with aria-current and data-active', () => {
    render(
      <PaginationLink href="#1" isActive>
        1
      </PaginationLink>,
    );
    const link = screen.getByRole('link', { name: '1' });
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(link.getAttribute('data-active')).toBe('true');
  });

  it('renders Previous with a label, an icon, and the wide (non-square) footprint', () => {
    render(<PaginationPrevious href="#" />);
    const link = screen.getByRole('link', { name: 'Go to previous page' });
    expect(link.className).not.toContain(paginationStyles.square);
    expect(screen.getByText('Previous')).toBeTruthy();
    expect(link.querySelector('svg')).not.toBeNull();
  });

  it('renders Next with a custom label', () => {
    render(<PaginationNext href="#" text="Forward" />);
    const link = screen.getByRole('link', { name: 'Go to next page' });
    expect(screen.getByText('Forward')).toBeTruthy();
    expect(link.className).not.toContain(paginationStyles.square);
  });

  it('renders the ellipsis as decorative with an accessible "More pages" fallback', () => {
    render(<PaginationEllipsis />);
    const ellipsis = document.querySelector(`.${paginationStyles.ellipsis}`);
    expect(ellipsis?.getAttribute('aria-hidden')).toBe('true');
    expect(ellipsis?.textContent).toBe('More pages');
  });

  it('forwards click handlers and native anchor props through PaginationLink', () => {
    const onClick = vi.fn();
    render(
      <PaginationLink href="#3" onClick={onClick}>
        3
      </PaginationLink>,
    );
    fireEvent.click(screen.getByRole('link', { name: '3' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  /*
   * Reads the module's own source: the drawn pagination item is a set of
   * numbers and a paint inversion, and jsdom computes neither. What this
   * pins is that the item owns them, rather than borrowing a Button size
   * that could move underneath it.
   */
  const rules = extractRules(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'pagination.module.css'), 'utf8'),
  );

  function declared(selector: string, prop: string) {
    const rule = rules.find((candidate) => candidate.selector === selector);
    return rule ? declarationMap(rule.body).get(prop) : undefined;
  }

  it('pins the drawn 28px item, its radius and its label role', () => {
    expect(declared('.link', 'height')).toBe('var(--control-height-xs)');
    expect(declared('.link', 'border-radius')).toBe('var(--radius-sm)');
    expect(declared('.link', 'color')).toBe('var(--muted-foreground)');
    expect(declared('.link', 'font-size')).toBe('var(--text-label-size)');
    expect(declared('.link.square', 'width')).toBe('var(--control-height-xs)');
    expect(declared('.ellipsis', 'height')).toBe('var(--control-height-xs)');
    expect(declared('.icon', 'width')).toBe('var(--icon-size-sm)');
    expect(declared('.content', 'gap')).toBe('var(--space-1)');
  });

  it('inverts the active page onto the page background under a primary label', () => {
    // Not an outline button: the drawn active item takes the page's own
    // background as its fill, which reads as a recess on a raised surface.
    expect(declared('.link[data-active]', 'background-color')).toBe('var(--background)');
    expect(declared('.link[data-active]', 'color')).toBe('var(--primary)');
  });
});
