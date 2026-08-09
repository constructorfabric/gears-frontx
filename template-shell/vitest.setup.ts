// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
//
// Shared Vitest test setup for template-shell and every project scaffolded
// from it. `renderStandaloneVitestSetupFile` in `vitest.shared.ts` reads this
// file verbatim at build time so scaffolded projects cannot drift away from
// the template's cleanup surface.
//
// This is a deliberate copy of the ecosystem repo's root-level
// `vitest.setup.ts`, not a shared import: template-shell is a
// self-contained, out-of-workspace directory (see Phase 11) and must not
// resolve paths outside its own root — `server.fs.allow` is scoped to
// template-shell only, so Vite/Vitest would reject a `/@fs` read one level
// up. The ecosystem keeps its own copy for its own tests.
//
// The file carries two responsibilities. At load it installs the browser
// globals jsdom leaves missing but component code legitimately expects (Web
// Storage, `PointerEvent`), so every jsdom suite starts from the same platform
// surface instead of each test file shimming what it happens to trip over.
//
// The afterEach block below then clears every shared slot that tests in this
// repo have been observed to mutate: timers, mocks, DOM storage/cookies,
// fetch, and the Module Federation shared-scope global owned by the screensets
// MFE handler. New leak surfaces (e.g. IndexedDB, future runtime registries)
// can be added here once a concrete test relies on them; we deliberately do
// not ship speculative cleanup for globals no source or test references.
import { afterEach, vi } from 'vitest';
import { trim } from 'lodash';
import { cleanup as cleanupReactRendering } from '@testing-library/react';
import type { JsonValue } from '@gears-frontx/react';

const ORIGINAL_FETCH_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  globalThis,
  'fetch',
);

// Federation shared-scope registry written by
// `packages/screensets/src/mfe/handler/mf-handler.ts`. Leaks across tests
// unless explicitly removed, because the handler caches a single scope object
// on globalThis for the lifetime of the runtime.
const sharedTeardowns = new Map<string, () => void>();

function restoreFetch(): void {
  if (ORIGINAL_FETCH_DESCRIPTOR) {
    Object.defineProperty(globalThis, 'fetch', ORIGINAL_FETCH_DESCRIPTOR);
  } else if (Reflect.has(globalThis, 'fetch')) {
    Reflect.deleteProperty(globalThis, 'fetch');
  }
}

function clearDocumentCookies(doc: Document): void {
  const raw = doc.cookie;
  if (!raw) return;
  for (const entry of raw.split(';')) {
    const eq = entry.indexOf('=');
    const rawName = eq === -1 ? entry : entry.slice(0, eq);
    const name = trim(rawName);
    if (!name) continue;
    doc.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

function clearFederationSharedScope(): void {
  if (Reflect.has(globalThis, '__federation_shared__')) {
    Reflect.deleteProperty(globalThis, '__federation_shared__');
  }
}

/** In-memory Storage for tests when Node/jsdom exposes a broken Web Storage (e.g. `--localstorage-file` without a path). */
function createMemoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length(): number {
      return items.size;
    },
    clear(): void {
      items.clear();
    },
    getItem(key: string): string | null {
      return items.get(key) ?? null;
    },
    key(index: number): string | null {
      if (index < 0 || index >= items.size) return null;
      let cursor = 0;
      for (const itemKey of items.keys()) {
        if (cursor === index) return itemKey;
        cursor += 1;
      }
      return null;
    },
    removeItem(key: string): void {
      items.delete(key);
    },
    setItem(key: string, value: string): void {
      items.set(key, value);
    },
  } as Storage;
}

function isUsableStorage(candidate: Storage | null | undefined): candidate is Storage {
  return (
    Boolean(candidate) &&
    typeof candidate.clear === 'function' &&
    typeof candidate.setItem === 'function' &&
    typeof candidate.getItem === 'function'
  );
}

function installMemoryStorageIfNeeded(
  target: Window & typeof globalThis,
  name: 'localStorage' | 'sessionStorage',
  current: Storage | null | undefined,
): void {
  if (isUsableStorage(current)) {
    return;
  }
  const replacement = createMemoryStorage();
  try {
    Object.defineProperty(target, name, {
      value: replacement,
      configurable: true,
      writable: true,
    });
  } catch {
    try {
      Reflect.set(target, name, replacement);
    } catch {
      // Non-configurable storage + hostile runtime: leave as-is.
    }
  }
}

function ensureUsableWebStorage(target: Window & typeof globalThis): void {
  installMemoryStorageIfNeeded(target, 'localStorage', target.localStorage);
  installMemoryStorageIfNeeded(target, 'sessionStorage', target.sessionStorage);
}

/**
 * Install a `PointerEvent` constructor on `target` when it has none.
 *
 * jsdom implements no `PointerEvent`, while component libraries built on Base
 * UI construct one off the element's owner window to forward a click onto the
 * hidden native input behind a checkbox, radio or switch. A suite that renders
 * such a component therefore dies on
 * `TypeError: ownerWindow(...).PointerEvent is not a constructor` before it
 * asserts anything, and it dies once per MFE package, which is why the shim
 * belongs to this shared setup rather than to whichever test file meets it
 * first.
 *
 * The class is declared inside the function, not at module scope, because
 * `MouseEvent` is itself absent under `environment: 'node'`, the setting the
 * logic-only packages that also load this file run with, and a module-scope
 * `extends MouseEvent` would fail those suites at import time.
 *
 * A `MouseEvent` subclass carrying the pointer-specific half of
 * `PointerEventInit` is the whole surface those code paths read; the
 * coalesced- and predicted-event accessors of the real interface are left off
 * deliberately, since nothing in this repo consumes them and a fabricated
 * answer would be worse than a missing method.
 *
 * One target is enough: under Vitest's jsdom environment the worker global IS
 * the jsdom window, so the same installation answers both a lookup off an
 * element's owner window and a bare `new PointerEvent(...)`.
 */
function installPointerEventConstructor(target: Window & typeof globalThis): void {
  if (typeof target.PointerEvent === 'function') {
    return;
  }

  // Defaults follow the PointerEvent specification's own `PointerEventInit`
  // defaults, so a shimmed event reads the same as a real one to code that
  // omits a field.
  class PointerEventShim extends MouseEvent {
    readonly pointerId: number;
    readonly width: number;
    readonly height: number;
    readonly pressure: number;
    readonly tangentialPressure: number;
    readonly tiltX: number;
    readonly tiltY: number;
    readonly twist: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.width = params.width ?? 1;
      this.height = params.height ?? 1;
      this.pressure = params.pressure ?? 0;
      this.tangentialPressure = params.tangentialPressure ?? 0;
      this.tiltX = params.tiltX ?? 0;
      this.tiltY = params.tiltY ?? 0;
      this.twist = params.twist ?? 0;
      this.pointerType = params.pointerType ?? '';
      this.isPrimary = params.isPrimary ?? false;
    }
  }

  Object.defineProperty(target, 'PointerEvent', {
    value: PointerEventShim,
    writable: true,
    configurable: true,
  });
}

function safeClearWebStorage(storage: Storage | null | undefined): void {
  if (!storage) {
    return;
  }
  if (typeof storage.clear === 'function') {
    storage.clear();
  }
}

export function registerSharedTestTeardown(
  key: string,
  teardown: () => void,
): void {
  if (!sharedTeardowns.has(key)) {
    sharedTeardowns.set(key, teardown);
  }
}

type DescriptorRegistryLeaf =
  | JsonValue
  | ((...args: never[]) => void | Promise<void>);

type DescriptorRegistryValue =
  | DescriptorRegistryLeaf
  | DescriptorRegistryValue[]
  | {
      readonly [key: string]: DescriptorRegistryValue | DescriptorRegistryLeaf;
    };

export type DescriptorRegistryTarget =
  | Window
  | typeof globalThis
  | Record<string, DescriptorRegistryValue>;

export function registerSharedDescriptorTeardown(
  target: DescriptorRegistryTarget,
  property: PropertyKey,
  key = String(property),
): void {
  if (sharedTeardowns.has(key)) {
    return;
  }

  const originalDescriptor = Object.getOwnPropertyDescriptor(target, property);
  registerSharedTestTeardown(key, () => {
    if (originalDescriptor) {
      Object.defineProperty(target, property, originalDescriptor);
      return;
    }

    Reflect.deleteProperty(target, property);
  });
}

export function runSharedTestCleanup(): void {
  // React Testing Library auto-registers its own `afterEach(cleanup)` only
  // when `window` is defined at import time, and only in test files that
  // import it directly. Invoking it from this shared hook guarantees the
  // unmount runs for every jsdom-environment test regardless of how the
  // suite consumes the library, so individual tests can drop manual
  // `cleanup()` calls without risking cross-test DOM leaks. The call is a
  // safe no-op under `environment: 'node'`, where nothing has been rendered.
  if ('window' in globalThis) {
    cleanupReactRendering();
  }

  vi.clearAllMocks();
  vi.restoreAllMocks();

  if ('window' in globalThis) {
    safeClearWebStorage(globalThis.window.localStorage);
    safeClearWebStorage(globalThis.window.sessionStorage);
  }

  vi.unstubAllGlobals();
  vi.useRealTimers();

  restoreFetch();

  if ('window' in globalThis) {
    ensureUsableWebStorage(globalThis.window);
    safeClearWebStorage(globalThis.window.localStorage);
    safeClearWebStorage(globalThis.window.sessionStorage);
    clearDocumentCookies(globalThis.window.document);
  }

  clearFederationSharedScope();

  for (const teardown of sharedTeardowns.values()) {
    teardown();
  }
  sharedTeardowns.clear();
}

if ('window' in globalThis) {
  ensureUsableWebStorage(globalThis.window);
  installPointerEventConstructor(globalThis.window);
}

afterEach(() => {
  runSharedTestCleanup();
});
