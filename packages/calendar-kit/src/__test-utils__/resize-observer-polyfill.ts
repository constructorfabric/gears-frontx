class ResizeObserverPolyfill implements ResizeObserver {
  private readonly observedTargets = new Set<Element>();

  observe(target: Element): void {
    this.observedTargets.add(target);
  }

  unobserve(target: Element): void {
    this.observedTargets.delete(target);
  }

  disconnect(): void {
    this.observedTargets.clear();
  }
}

export const installResizeObserverPolyfill = (): void => {
  if (window.ResizeObserver !== undefined) {
    return;
  }

  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    value: ResizeObserverPolyfill,
    writable: true,
  });
};
