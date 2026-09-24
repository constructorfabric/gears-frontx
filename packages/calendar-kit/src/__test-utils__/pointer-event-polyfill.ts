class PointerEventPolyfill extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;

  constructor(type: string, params: PointerEventInit = {}) {
    super(type, params);
    this.pointerId = params.pointerId ?? 0;
    this.pointerType = params.pointerType ?? "";
  }
}

export const installPointerEventPolyfill = (): void => {
  if (window.PointerEvent !== undefined) {
    return;
  }

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: PointerEventPolyfill,
    writable: true,
  });
};
