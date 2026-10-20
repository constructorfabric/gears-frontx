import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { declarationMap, extractRules } from '../../__test-utils__/css-rules';
import {
  Pagination,
  PaginationButton,
  type PaginationButtonProps,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationNextButton,
  PaginationPrevious,
  PaginationPreviousButton,
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

  it('renders Previous and Next with a label, an icon, and the wide (non-square) footprint', () => {
    render(
      <>
        <PaginationPrevious href="#" />
        <PaginationNext href="#" />
      </>,
    );
    for (const name of ['Go to previous page', 'Go to next page']) {
      const link = screen.getByRole('link', { name });
      expect(link.className).not.toContain(paginationStyles.square);
      expect(link.querySelector('svg')).not.toBeNull();
    }
    expect(screen.getByText('Previous')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();
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

  it('renders PaginationButton as a native button that wears the item classes', () => {
    render(<PaginationButton>2</PaginationButton>);
    const button = screen.getByRole('button', { name: '2' });
    expect(button).toHaveProperty('tagName', 'BUTTON');
    // type="button": a page button inside a form must never submit it.
    expect(button).toHaveProperty('type', 'button');
    expect(button.className).toContain(paginationStyles.link);
    expect(button.className).toContain(paginationStyles.square);
    expect(button.hasAttribute('aria-current')).toBe(false);
    expect(button.hasAttribute('data-active')).toBe(false);
  });

  it('marks the active page button with aria-current and data-active', () => {
    render(<PaginationButton isActive>1</PaginationButton>);
    const button = screen.getByRole('button', { name: '1' });
    expect(button.getAttribute('aria-current')).toBe('page');
    expect(button.getAttribute('data-active')).toBe('true');
  });

  it('fires PaginationButton clicks, and not once it is disabled', () => {
    const onClick = vi.fn();
    const { rerender } = render(<PaginationButton onClick={onClick}>3</PaginationButton>);
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <PaginationButton onClick={onClick} disabled>
        3
      </PaginationButton>,
    );
    const button = screen.getByRole('button', { name: '3' });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button).toHaveProperty('disabled', true);
  });

  it('renders the previous and next buttons with a label, a chevron and the wide footprint', () => {
    render(
      <>
        <PaginationPreviousButton />
        <PaginationNextButton />
      </>,
    );
    const previous = screen.getByRole('button', { name: 'Go to previous page' });
    const next = screen.getByRole('button', { name: 'Go to next page' });
    expect(screen.getByText('Previous')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();
    for (const button of [previous, next]) {
      expect(button.className).not.toContain(paginationStyles.square);
      expect(button.querySelector('svg')).not.toBeNull();
    }
    // Enabled until the range ends.
    expect(previous).toHaveProperty('disabled', false);
    expect(next).toHaveProperty('disabled', false);
  });

  // A page button and the two end buttons share one disabled behaviour: it
  // comes from the part they all render, so each is asserted, not assumed.
  describe.each([
    ['PaginationButton', (props: PaginationButtonProps) => <PaginationButton {...props}>3</PaginationButton>, '3'],
    [
      'PaginationPreviousButton',
      (props: PaginationButtonProps) => <PaginationPreviousButton {...props} />,
      'Go to previous page',
    ],
    ['PaginationNextButton', (props: PaginationButtonProps) => <PaginationNextButton {...props} />, 'Go to next page'],
  ])('%s when disabled', (_part, element, name) => {
    // A natively disabled button is one browsers refuse focus to. jsdom cannot
    // show the refusal itself: it focuses anything carrying a tabindex, and
    // Base UI's Button always sets one, so `focus()` would land here whatever
    // the code does. `:disabled` is the state the refusal follows from; the
    // refusal itself is a browser behavior only a real browser shows.
    it('is natively disabled, so a browser will not focus it, and fires nothing', () => {
      const onClick = vi.fn();
      render(element({ disabled: true, onClick }));
      const button = screen.getByRole('button', { name });
      expect(button.matches(':disabled')).toBe(true);
      expect(button.hasAttribute('aria-disabled')).toBe(false);
      fireEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
      // What the dimmed paint selects on, with the native attribute present.
      expect(button.hasAttribute('data-disabled')).toBe(true);
    });

    it('can take focus with focusableWhenDisabled, and still fires nothing', () => {
      const onClick = vi.fn();
      render(element({ disabled: true, focusableWhenDisabled: true, onClick }));
      const button = screen.getByRole('button', { name });
      button.focus();
      expect(document.activeElement).toBe(button);
      fireEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
      // Reported through ARIA, not the native attribute that would blur it,
      // and still marked for the same dimmed paint.
      expect(button.matches(':disabled')).toBe(false);
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.hasAttribute('data-disabled')).toBe(true);
    });

    it('behaves as an ordinary live button with focusableWhenDisabled while not disabled', () => {
      const onClick = vi.fn();
      render(element({ focusableWhenDisabled: true, onClick }));
      const button = screen.getByRole('button', { name });
      fireEvent.click(button);
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(button.hasAttribute('data-disabled')).toBe(false);
    });
  });

  /*
   * The name of the previous and next parts, in all four forms. A custom text
   * is what is on screen above 640px and nothing below it, so it has to be the
   * name; the default text keeps the longer one that says which page it goes to.
   */
  describe.each([
    {
      part: 'PaginationPrevious',
      role: 'link',
      name: 'Go to previous page',
      label: 'Previous',
      element: (props: { text?: string; 'aria-label'?: string }) => <PaginationPrevious href="#" {...props} />,
    },
    {
      part: 'PaginationNext',
      role: 'link',
      name: 'Go to next page',
      label: 'Next',
      element: (props: { text?: string; 'aria-label'?: string }) => <PaginationNext href="#" {...props} />,
    },
    {
      part: 'PaginationPreviousButton',
      role: 'button',
      name: 'Go to previous page',
      label: 'Previous',
      element: (props: { text?: string; 'aria-label'?: string }) => <PaginationPreviousButton {...props} />,
    },
    {
      part: 'PaginationNextButton',
      role: 'button',
      name: 'Go to next page',
      label: 'Next',
      element: (props: { text?: string; 'aria-label'?: string }) => <PaginationNextButton {...props} />,
    },
  ] as const)('$part accessible name', ({ role, name, label, element }) => {
    // Also what keeps each part's literal default `text` and the name helpers'
    // constant in step (see pagination.tsx): were they to differ, the default
    // would be taken for a custom text and become the name itself.
    it('is the page-describing name with the default text, and shows the short label', () => {
      render(element({}));
      expect(screen.getByRole(role, { name }).textContent).toBe(label);
    });

    it('is the custom text when one is given', () => {
      render(element({ text: 'Forward' }));
      expect(screen.getByRole(role, { name: 'Forward' }).textContent).toBe('Forward');
      expect(screen.queryByRole(role, { name })).toBeNull();
    });

    it('is an aria-label of its own, whatever the text', () => {
      render(element({ text: 'Forward', 'aria-label': 'Older results' }));
      expect(screen.getByRole(role, { name: 'Older results' })).toBeTruthy();
    });

    // A blank text hides the label like an empty one does, and a name made of
    // whitespace is ignored by the browser, so it must not become the name.
    it.each([['empty', ''], ['blank', '  ']])(
      'keeps the page-describing name when the text is %s, the icon-only form',
      (_kind, text) => {
        render(element({ text }));
        expect(screen.getByRole(role, { name }).textContent?.trim()).toBe('');
      },
    );
  });

  it('puts the chevron before the previous label and after the next one', () => {
    render(
      <>
        <PaginationPrevious href="#" />
        <PaginationNextButton />
      </>,
    );
    const previous = screen.getByRole('link', { name: 'Go to previous page' });
    const next = screen.getByRole('button', { name: 'Go to next page' });
    expect(previous.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    expect(next.lastElementChild?.tagName.toLowerCase()).toBe('svg');
  });

  it('gives the anchor and the button chevrons the class that mirrors them in right-to-left', () => {
    render(
      <>
        <PaginationPrevious href="#" />
        <PaginationNext href="#" />
        <PaginationPreviousButton />
        <PaginationNextButton />
      </>,
    );
    const chevrons = document.querySelectorAll('svg');
    expect(chevrons).toHaveLength(4);
    for (const chevron of chevrons) {
      expect(chevron.getAttribute('class')).toContain(paginationStyles.chevron);
    }
    // The ellipsis dots are not directional and must not mirror.
    render(<PaginationEllipsis />);
    expect(document.querySelector(`.${paginationStyles.ellipsis} svg`)?.getAttribute('class')).not.toContain(
      paginationStyles.chevron,
    );
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

  it('mirrors the chevron under a right-to-left direction', () => {
    // jsdom resolves neither layout nor `:dir()`, so the rule itself is what
    // can be pinned: a horizontal flip scoped to the chevron class alone.
    expect(declared('.chevron:dir(rtl)', 'transform')).toBe('scaleX(-1)');
  });

  it('strips the native button chrome in the shared item rule, and dims a disabled one', () => {
    expect(declared('.link', 'border')).toBe('0');
    expect(declared('.link', 'padding-block')).toBe('0');
    // Both forms of a disabled button: the native one, and the one that
    // stays focusable and reports `data-disabled` instead.
    const disabled = '.link:disabled,\n.link[data-disabled]';
    expect(declared(disabled, 'opacity')).toBe('var(--opacity-disabled)');
    expect(declared(disabled, 'pointer-events')).toBe('none');
  });

  it('inverts the active page onto the page background under a primary label', () => {
    // Not an outline button: the drawn active item takes the page's own
    // background as its fill, which reads as a recess on a raised surface.
    expect(declared('.link[data-active]', 'background-color')).toBe('var(--background)');
    expect(declared('.link[data-active]', 'color')).toBe('var(--primary)');
  });
});
