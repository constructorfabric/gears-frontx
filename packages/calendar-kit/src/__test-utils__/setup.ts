import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { installPointerEventPolyfill } from "./pointer-event-polyfill";
import { installResizeObserverPolyfill } from "./resize-observer-polyfill";

declare global {
  var BASE_UI_ANIMATIONS_DISABLED: boolean | undefined;
}

globalThis.BASE_UI_ANIMATIONS_DISABLED = true;

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

export const createMemoryStorage = (): Storage => new MemoryStorage();

export const createShadowHost = () => {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  document.body.append(host);

  return { host, root };
};

const installDeterministicAnimationFrame = (): void => {
  if (typeof window === "undefined") {
    return;
  }

  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: window.setTimeout.bind(window),
    writable: true,
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: window.clearTimeout.bind(window),
    writable: true,
  });
};

// jsdom spends seconds on the top-layer pseudo-classes Floating UI probes on every reposition.
type NativeElementMatches = (this: Element, selector: string) => boolean;

const isElementMatches = (value: unknown): value is NativeElementMatches =>
  typeof value === "function";

const installFloatingUiPseudoClassPolyfill = (): void => {
  const descriptor = Object.getOwnPropertyDescriptor(
    Element.prototype,
    "matches"
  );

  if (descriptor === undefined || typeof descriptor.value !== "function") {
    return;
  }

  const descriptorValue: unknown = descriptor.value;

  if (!isElementMatches(descriptorValue)) {
    return;
  }

  const nativeMatches = descriptorValue;
  Object.defineProperty(Element.prototype, "matches", {
    configurable: true,
    value(this: Element, selector: string): boolean {
      if (selector === ":popover-open" || selector === ":modal") {
        return false;
      }
      return nativeMatches.call(this, selector);
    },
    writable: true,
  });
};

const initialFetch = globalThis.fetch;

const memoryStorages: Storage[] = [];

const noopScrollIntoView = (): void => {
  // jsdom has no layout engine, so scrolling is never observable.
};

if (typeof window !== "undefined") {
  const localStorage = createMemoryStorage();
  const sessionStorage = createMemoryStorage();
  memoryStorages.push(localStorage, sessionStorage);

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorage,
  });
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: sessionStorage,
  });

  installDeterministicAnimationFrame();
  installFloatingUiPseudoClassPolyfill();
  installPointerEventPolyfill();
  installResizeObserverPolyfill();
}

if (
  typeof Element !== "undefined" &&
  Element.prototype.scrollIntoView === undefined
) {
  Element.prototype.scrollIntoView = noopScrollIntoView;
}

afterEach(() => {
  cleanup();

  for (const storage of memoryStorages) {
    storage.clear();
  }

  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();

  globalThis.fetch = initialFetch;
});
