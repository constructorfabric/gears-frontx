import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { createColumnAutoSize } from './create-column-auto-size';

type ResizeCallback = (entries: ResizeObserverEntry[]) => void;

let resizeCallback: ResizeCallback;
let observeSpy: MockInstance;
let unobserveSpy: MockInstance;

function installMockObserver() {
  observeSpy = vi.fn();
  unobserveSpy = vi.fn();

  // `vi.stubGlobal` is the kit-convention way to stub browser-global constructors
  // — it integrates with `vi.restoreAllMocks()` in `afterEach`. See
  // `documentation/guidelines/testing.md` "Browser API mocking".
  vi.stubGlobal(
    'ResizeObserver',
    function MockResizeObserver(
      this: { observe: unknown; unobserve: unknown; disconnect: unknown },
      cb: ResizeCallback,
    ) {
      this.observe = observeSpy;
      this.unobserve = unobserveSpy;
      this.disconnect = vi.fn();
      resizeCallback = cb;
    },
  );
}

function fireResize(target: HTMLElement) {
  // The kit measures via offsetWidth + temp style toggle (intrinsic),
  // not via the entry's borderBoxSize. The entry shape is provided to
  // satisfy ResizeObserverEntry's API; the borderBoxSize value here is
  // intentionally distinct from the element's mock intrinsic width so
  // the test verifies which value the kit actually uses.
  resizeCallback([
    {
      target,
      borderBoxSize: [{ inlineSize: -999, blockSize: 0 }],
      contentBoxSize: [{ inlineSize: -999, blockSize: 0 }],
      contentRect: { width: -999, height: 0, x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0 },
      devicePixelContentBoxSize: [],
    } as unknown as ResizeObserverEntry,
  ]);
}

interface MockElementOpts {
  connected?: boolean;
  parentPadding?: number;
  /**
   * Width returned by `offsetWidth` when `style.inlineSize === 'max-content'`
   * (the intrinsic width the fixed kit reads). Defaults to 0.
   */
  intrinsicWidth?: number;
  /**
   * Width returned by `offsetWidth` when `style.inlineSize` is any other
   * value (simulating the parent-constrained rendered width that would
   * have been the old kit's measurement under a squeezed parent).
   */
  squeezedWidth?: number;
}

function createMockElement(opts: MockElementOpts = {}): HTMLElement {
  const { connected = true, parentPadding = 0, intrinsicWidth = 0, squeezedWidth = 0 } = opts;

  const td = parentPadding > 0 ? ({ style: {} } as unknown as HTMLElement) : null;

  if (td && parentPadding > 0) {
    // `vi.stubGlobal` per kit convention — see `documentation/guidelines/testing.md`.
    vi.stubGlobal(
      'getComputedStyle',
      vi.fn().mockReturnValue({
        paddingInlineStart: `${parentPadding / 2}px`,
        paddingInlineEnd: `${parentPadding / 2}px`,
      }),
    );
  }

  // Mutable `style` so the kit's temp-toggle `el.style.inlineSize = 'max-content'`
  // round-trips through a real getter on a plain object.
  const style: CSSStyleDeclaration = { inlineSize: '' } as unknown as CSSStyleDeclaration;

  const el = {
    isConnected: connected,
    closest: () => td,
    style,
    get offsetWidth() {
      return style.inlineSize === 'max-content' ? intrinsicWidth : squeezedWidth;
    },
  } as unknown as HTMLElement;

  return el;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createColumnAutoSize', () => {
  it('returns a measureRef function', () => {
    installMockObserver();
    const { measureRef } = createColumnAutoSize(vi.fn());
    expect(typeof measureRef).toBe('function');
  });

  it('observes elements passed to measureRef', () => {
    installMockObserver();
    const { measureRef } = createColumnAutoSize(vi.fn());
    const el = createMockElement();

    measureRef(el);

    expect(observeSpy).toHaveBeenCalledWith(el);
  });

  it('calls onWidthChange with the intrinsic offsetWidth (rounded up) on resize', () => {
    installMockObserver();
    const onWidthChange = vi.fn();
    const { measureRef } = createColumnAutoSize(onWidthChange);

    // Intrinsic 42.3 — kit should read this when temp-toggling inline-size to max-content.
    const el = createMockElement({ intrinsicWidth: 42.3 });
    measureRef(el);

    fireResize(el);

    expect(onWidthChange).toHaveBeenCalledWith('43px');
  });

  it('tracks max across multiple elements', () => {
    installMockObserver();
    const onWidthChange = vi.fn();
    const { measureRef } = createColumnAutoSize(onWidthChange);

    const el1 = createMockElement({ intrinsicWidth: 30 });
    const el2 = createMockElement({ intrinsicWidth: 50 });
    measureRef(el1);
    measureRef(el2);

    fireResize(el1);
    fireResize(el2);

    expect(onWidthChange).toHaveBeenLastCalledWith('50px');
  });

  it('does not call onWidthChange when width is unchanged', () => {
    installMockObserver();
    const onWidthChange = vi.fn();
    const { measureRef } = createColumnAutoSize(onWidthChange);

    const el = createMockElement({ intrinsicWidth: 40 });
    measureRef(el);

    fireResize(el);
    onWidthChange.mockClear();

    fireResize(el);
    expect(onWidthChange).not.toHaveBeenCalled();
  });

  it('includes parent padding in width calculation', () => {
    installMockObserver();
    const onWidthChange = vi.fn();
    const { measureRef } = createColumnAutoSize(onWidthChange);

    const el = createMockElement({ parentPadding: 20, intrinsicWidth: 50 });
    measureRef(el);

    fireResize(el);

    // 50 content + 20 padding = 70
    expect(onWidthChange).toHaveBeenCalledWith('70px');
  });

  it('recalculates max when larger element is removed', () => {
    installMockObserver();
    const onWidthChange = vi.fn();
    const { measureRef } = createColumnAutoSize(onWidthChange);

    const small = createMockElement({ intrinsicWidth: 20 });
    const large = createMockElement({ intrinsicWidth: 80 });
    measureRef(small);
    measureRef(large);

    fireResize(small);
    fireResize(large);
    onWidthChange.mockClear();

    // Simulate large element unmounting
    Object.defineProperty(large, 'isConnected', { value: false });
    measureRef(null);

    // Max should drop to 20
    expect(onWidthChange).toHaveBeenCalledWith('20px');
  });

  it('cleans up disconnected elements on null ref call', () => {
    installMockObserver();
    const { measureRef } = createColumnAutoSize(vi.fn());

    const connected = createMockElement();
    const disconnected = createMockElement();
    measureRef(connected);
    measureRef(disconnected);

    Object.defineProperty(disconnected, 'isConnected', { value: false });
    measureRef(null);

    expect(unobserveSpy).toHaveBeenCalledWith(disconnected);
    expect(unobserveSpy).not.toHaveBeenCalledWith(connected);
  });

  it('calls onWidthChange with 0px when all elements are removed', () => {
    installMockObserver();
    const onWidthChange = vi.fn();
    const { measureRef } = createColumnAutoSize(onWidthChange);

    const el = createMockElement({ intrinsicWidth: 40 });
    measureRef(el);
    fireResize(el);
    onWidthChange.mockClear();

    Object.defineProperty(el, 'isConnected', { value: false });
    measureRef(null);

    expect(onWidthChange).toHaveBeenCalledWith('0px');
  });

  // The regression guard for a squeezed parent. In a real browser, setting
  // `style.inlineSize = 'max-content'` on an element inside a squeezed parent and reading
  // `offsetWidth` returns the intrinsic value rather than the parent-constrained rendered value.
  // This test pins that invariant.
  describe('intrinsic measurement under squeezed parent', () => {
    it('uses intrinsic (max-content) offsetWidth, not the parent-constrained rendered width', () => {
      installMockObserver();
      const onWidthChange = vi.fn();
      const { measureRef } = createColumnAutoSize(onWidthChange);

      // The element's parent (a `<td>` under table-layout:fixed) is allocated only 10px,
      // so the rendered width is 10. The element's intrinsic content (two icon buttons +
      // gap) is 58. The kit must report 58, not 10.
      const el = createMockElement({ intrinsicWidth: 58, squeezedWidth: 10 });
      measureRef(el);

      fireResize(el);

      expect(onWidthChange).toHaveBeenCalledWith('58px');
      expect(onWidthChange).not.toHaveBeenCalledWith('10px');
    });

    it('restores style.inlineSize after measuring so the observer does not re-fire', () => {
      installMockObserver();
      const { measureRef } = createColumnAutoSize(vi.fn());

      const el = createMockElement({ intrinsicWidth: 58, squeezedWidth: 10 });
      // Simulate a prior inline-size value the kit must preserve.
      el.style.inlineSize = 'min-content';

      measureRef(el);
      fireResize(el);

      // After the measurement, the inline-size must be restored to whatever the consumer
      // had set. If we left it as 'max-content', the browser would re-fire the observer
      // and the kit would loop.
      expect(el.style.inlineSize).toBe('min-content');
    });
  });
});
