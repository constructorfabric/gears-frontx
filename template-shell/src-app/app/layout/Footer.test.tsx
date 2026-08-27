import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { FooterState } from '@gears-frontx/react';
import { Footer } from './Footer';

let mockFooterState: FooterState | undefined;

vi.mock('@gears-frontx/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@gears-frontx/react')>()),
  useAppSelector: () => mockFooterState,
}));

describe('Footer', () => {
  it('renders nothing with no children', () => {
    mockFooterState = undefined;
    const { container } = render(<Footer />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a falsy conditional child, not an empty band', () => {
    // `Children.count(false)` is 1, not 0 — the case `Children.toArray`
    // exists to guard against: a screen writing `{enabled && <X />}` with
    // `enabled` false must not resurrect the 40px strip this component
    // exists to suppress when it has nothing to show.
    mockFooterState = undefined;
    const showExtra = false;
    const { container } = render(<Footer>{showExtra && <span>extra</span>}</Footer>);
    expect(container.firstChild).toBeNull();
  });

  it('renders its children when present and visible', () => {
    mockFooterState = { visible: true };
    render(
      <Footer>
        <span>status</span>
      </Footer>,
    );
    expect(screen.getByText('status')).toBeTruthy();
  });

  it('renders nothing when explicitly hidden, even with children', () => {
    mockFooterState = { visible: false };
    const { container } = render(
      <Footer>
        <span>status</span>
      </Footer>,
    );
    expect(container.firstChild).toBeNull();
  });
});
