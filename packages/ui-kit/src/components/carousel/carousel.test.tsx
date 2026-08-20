import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  useCarousel,
  type CarouselApi,
} from './carousel';
import buttonStyles from '../button/button.module.css';
import styles from './carousel.module.css';

afterEach(cleanup);

/*
 * jsdom performs no real layout (every element measures 0x0 — see
 * src/__test-utils__/setup.ts's ResizeObserver polyfill comment), so embla
 * never observes a scrollable overflow: canScrollPrev/canScrollNext stay
 * false regardless of slide count, and scrollPrev()/scrollNext() are no-ops
 * with nothing to actually move. These tests verify structure, context
 * wiring, and prop plumbing (what jsdom CAN prove) — not real scrolling or
 * keyboard-driven slide changes (what it can't).
 */

function ThreeSlideCarousel(props: Partial<Parameters<typeof Carousel>[0]> = {}) {
  return (
    <Carousel {...props}>
      <CarouselContent>
        <CarouselItem data-testid="item-1">1</CarouselItem>
        <CarouselItem data-testid="item-2">2</CarouselItem>
        <CarouselItem data-testid="item-3">3</CarouselItem>
      </CarouselContent>
      <CarouselPrevious data-testid="prev" />
      <CarouselNext data-testid="next" />
    </Carousel>
  );
}

describe('Carousel', () => {
  it('renders the region role with the carousel class and default horizontal orientation', () => {
    render(<ThreeSlideCarousel className="consumer" />);
    const region = screen.getByRole('region');
    expect(region.getAttribute('aria-roledescription')).toBe('carousel');
    expect(region.getAttribute('data-orientation')).toBe('horizontal');
    expect(region.className).toContain(styles.carousel);
    expect(region.className).toContain('consumer');
  });

  it('switches to the vertical orientation and propagates it to every part', () => {
    render(<ThreeSlideCarousel orientation="vertical" />);
    expect(screen.getByRole('region').getAttribute('data-orientation')).toBe('vertical');
    expect(screen.getByTestId('item-1').getAttribute('data-orientation')).toBe('vertical');
    expect(screen.getByTestId('prev').getAttribute('data-orientation')).toBe('vertical');
    expect(screen.getByTestId('next').getAttribute('data-orientation')).toBe('vertical');
  });

  it('renders each slide with the group/slide roledescription and the item class', () => {
    render(<ThreeSlideCarousel />);
    const item = screen.getByTestId('item-2');
    expect(item.getAttribute('role')).toBe('group');
    expect(item.getAttribute('aria-roledescription')).toBe('slide');
    expect(item.className).toContain(styles.item);
  });

  it('throws when useCarousel is called outside a <Carousel />', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Consumer() {
      useCarousel();
      return null;
    }
    expect(() => render(<Consumer />)).toThrow('useCarousel must be used within a <Carousel />');
    consoleError.mockRestore();
  });

  it('renders Previous/Next as icon-only buttons with the default nav labels', () => {
    render(<ThreeSlideCarousel />);
    const prev = screen.getByRole('button', { name: 'Previous slide' });
    const next = screen.getByRole('button', { name: 'Next slide' });
    expect(prev.hasAttribute('data-icon-only')).toBe(true);
    expect(next.hasAttribute('data-icon-only')).toBe(true);
  });

  it('defaults Previous/Next to outline/sm and lets a consumer override both plus the label', () => {
    render(<ThreeSlideCarousel />);
    const defaultPrev = screen.getByTestId('prev');
    expect(defaultPrev.className).toContain(buttonStyles.variantOutline);
    expect(defaultPrev.className).toContain(buttonStyles.sizeSm);

    cleanup();
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>1</CarouselItem>
        </CarouselContent>
        <CarouselPrevious aria-label="Show earlier photo" variant="ghost" size="lg" />
      </Carousel>,
    );
    const prev = screen.getByRole('button', { name: 'Show earlier photo' });
    expect(prev.className).toContain(buttonStyles.variantGhost);
    expect(prev.className).toContain(buttonStyles.sizeLg);
  });

  it('starts both nav buttons disabled — jsdom reports zero scrollable distance regardless of slide count', () => {
    render(<ThreeSlideCarousel />);
    expect(screen.getByTestId('prev')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('next')).toHaveProperty('disabled', true);
  });

  it('captures the embla CarouselApi via setApi and wires arrow keys to it', () => {
    let capturedApi: CarouselApi;
    render(
      <Carousel
        setApi={(api) => {
          capturedApi = api;
        }}
      >
        <CarouselContent>
          <CarouselItem>1</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );

    expect(capturedApi).toBeDefined();
    const scrollPrevSpy = vi.spyOn(capturedApi!, 'scrollPrev');
    const scrollNextSpy = vi.spyOn(capturedApi!, 'scrollNext');
    const region = screen.getByRole('region');

    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(scrollNextSpy).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(region, { key: 'ArrowLeft' });
    expect(scrollPrevSpy).toHaveBeenCalledTimes(1);
  });
});
