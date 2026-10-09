interface ColumnAutoSize {
  measureRef: (element: HTMLElement | null) => void;
  destroy: () => void;
}

export function createColumnAutoSize(onWidthChange: (width: string) => void): ColumnAutoSize {
  const widthMap = new Map<HTMLElement, number>();
  let currentMax = 0;
  let observer: ResizeObserver | null = null;

  return {
    measureRef,
    destroy,
  };

  function destroy() {
    observer?.disconnect();
    observer = null;
    widthMap.clear();
    currentMax = 0;
  }

  function getObserver(): ResizeObserver {
    observer ??= new ResizeObserver((entries) => {
      let changed = false;
      let referenceEl: HTMLElement | null = null;

      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        referenceEl = el;
        const width = measureIntrinsicInlineSize(el);
        const prev = widthMap.get(el);

        if (prev !== width) {
          widthMap.set(el, width);
          changed = true;
        }
      }

      if (changed) {
        updateMax(referenceEl);
      }
    });
    return observer;
  }

  // Read the element's intrinsic max-content inline-size rather than the
  // rendered borderBox value. ResizeObserver entries report the rendered
  // size, which collapses below the element's natural content width when
  // the parent (a `<td>` under `table-layout: fixed`) is allocated less
  // space than the content needs. Using the rendered value back as the
  // column's "natural" width locks the column below its content.
  //
  // Temporarily setting `inline-size: max-content` forces the browser to
  // resolve the intrinsic size regardless of parent constraint; the
  // restoration in the same task leaves the element's final rendered size
  // unchanged so the browser does not re-fire the ResizeObserver.
  function measureIntrinsicInlineSize(el: HTMLElement): number {
    const prevInlineSize = el.style.inlineSize;
    el.style.inlineSize = 'max-content';
    const intrinsic = el.offsetWidth;
    el.style.inlineSize = prevInlineSize;
    return intrinsic;
  }

  function updateMax(referenceEl: HTMLElement | null = null) {
    let max = 0;
    for (const width of widthMap.values()) {
      if (width > max) max = width;
    }

    const parentPadding = getParentPadding(referenceEl);
    const total = Math.ceil(max + parentPadding);

    if (total !== currentMax) {
      currentMax = total;
      onWidthChange(`${total}px`);
    }
  }

  // Reads padding-inline on the first connected observed element's parent TD/TH.
  // Prefer the just-fired observer entry's target (passed via referenceEl) because
  // widthMap.keys() can have a stale `firstEl` that React has unmounted — its
  // `closest('td, th')` would return null and we'd silently fall back to padding=0,
  // producing column widths that don't account for cell padding.
  function getParentPadding(referenceEl: HTMLElement | null): number {
    const candidates: HTMLElement[] = [];
    if (referenceEl) candidates.push(referenceEl);
    for (const el of widthMap.keys()) candidates.push(el);

    for (const el of candidates) {
      if (!el.isConnected) continue;
      const td = el.closest('td, th');
      if (!td) continue;
      const style = getComputedStyle(td);
      return (
        parseFloat(style.paddingInlineStart || '0') + parseFloat(style.paddingInlineEnd || '0')
      );
    }
    return 0;
  }

  function measureRef(element: HTMLElement | null) {
    if (element) {
      widthMap.set(element, 0);
      getObserver().observe(element);
    } else {
      // Deferred cleanup: React calls ref(null) before removing the DOM node,
      // so the element being unmounted is still connected at this point.
      // Previously disconnected elements (from earlier unmounts) are cleaned up here.
      // This means stale entries lag by one unmount cycle — at most ~1 viewport worth.
      // Deleting from a Map during keys() iteration is safe per the JS spec.
      for (const el of widthMap.keys()) {
        if (!el.isConnected) {
          getObserver().unobserve(el);
          widthMap.delete(el);
        }
      }
      updateMax();
    }
  }
}
