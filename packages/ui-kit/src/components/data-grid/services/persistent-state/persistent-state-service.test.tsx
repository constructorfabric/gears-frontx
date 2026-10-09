import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '../../../../__test-utils__/render-with-user';
import { DataGrid } from '../../data-grid';
import type { DataGridLoadResult } from '../../data-grid-types';
import { useDataGridPluginContext } from '../core/data-grid-context';
import type { DataGridTableColumn } from '../table/table-types';
import type { PersistOptions } from './persistent-state-types';

vi.stubGlobal(
  'ResizeObserver',
  vi.fn(function () {
    return {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    };
  }),
);

interface TestItem {
  id: number;
  name: string;
}

const testColumns: DataGridTableColumn<TestItem>[] = [{ id: 'name', label: 'Name' }];

function loadFn(): Promise<DataGridLoadResult<TestItem>> {
  return Promise.resolve({ results: [], total: 0 });
}

const emptyDisplay = 'empty';

// Probe exercising the registry the same way plugins do: hydrate from `value`
// on creation, write through `setValue`, read `value` back on demand.
function PersistentStateProbe() {
  const context = useDataGridPluginContext();
  const state = context.registerPersistentState<{ page: number }>('probe');
  const [display, setDisplay] = useState(() => JSON.stringify(state.value) ?? emptyDisplay);

  return (
    <>
      <output aria-label="Probe value">{display}</output>
      <button type="button" onClick={() => state.setValue({ page: 2 })}>
        Set probe
      </button>
      <button type="button" onClick={() => state.setValue(undefined)}>
        Clear probe
      </button>
      <button type="button" onClick={() => setDisplay(JSON.stringify(state.value) ?? emptyDisplay)}>
        Read probe
      </button>
    </>
  );
}

// Same probe shape, but for a state registered with `router: false` — the
// opt-out a plugin uses for state that must not land in a shareable URL.
function RouterOptOutProbe() {
  const context = useDataGridPluginContext();
  const state = context.registerPersistentState<{ page: number }>('optout', { router: false });
  const [display, setDisplay] = useState(() => JSON.stringify(state.value) ?? emptyDisplay);

  return (
    <>
      <output aria-label="Optout value">{display}</output>
      <button type="button" onClick={() => state.setValue({ page: 2 })}>
        Set optout
      </button>
      <button type="button" onClick={() => setDisplay(JSON.stringify(state.value) ?? emptyDisplay)}>
        Read optout
      </button>
    </>
  );
}

// Same probe shape again, for a state that names its own backend through `storage` — the
// override a service reaches for when its state belongs to the viewer rather than to the view
// they would share.
function StorageOverrideProbe(options: PersistOptions) {
  const context = useDataGridPluginContext();
  const state = context.registerPersistentState<{ page: number }>('override', options);
  const [display, setDisplay] = useState(() => JSON.stringify(state.value) ?? emptyDisplay);

  return (
    <>
      <output aria-label="Override value">{display}</output>
      <button type="button" onClick={() => state.setValue({ page: 2 })}>
        Set override
      </button>
      <button type="button" onClick={() => setDisplay(JSON.stringify(state.value) ?? emptyDisplay)}>
        Read override
      </button>
    </>
  );
}

function renderGrid(name: string, persistent?: 'localStorage' | 'memory' | 'router') {
  return render(
    <DataGrid name={name} persistent={persistent} load={loadFn} columns={testColumns}>
      <PersistentStateProbe />
      <RouterOptOutProbe />
    </DataGrid>,
  );
}

function renderOverrideGrid(
  name: string,
  persistent: 'localStorage' | 'memory' | 'router' | undefined,
  options: PersistOptions,
) {
  return render(
    <DataGrid name={name} persistent={persistent} load={loadFn} columns={testColumns}>
      <StorageOverrideProbe {...options} />
    </DataGrid>,
  );
}

describe('persistentStateService', () => {

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, '', window.location.pathname);
  });

  describe('memory mode', () => {
    it('keeps state readable within one mount without touching browser storage', async () => {
      const { user } = await renderGrid('test_persistent_memory', 'memory');

      await user.click(screen.getByRole('button', { name: 'Set probe' }));
      await user.click(screen.getByRole('button', { name: 'Read probe' }));

      expect(screen.getByLabelText('Probe value')).toHaveTextContent('{"page":2}');
      expect(localStorage).toHaveLength(0);
      expect(sessionStorage).toHaveLength(0);
    });

    it('clears state with setValue(undefined)', async () => {
      const { user } = await renderGrid('test_persistent_memory_clear', 'memory');

      await user.click(screen.getByRole('button', { name: 'Set probe' }));
      await user.click(screen.getByRole('button', { name: 'Clear probe' }));
      await user.click(screen.getByRole('button', { name: 'Read probe' }));

      expect(screen.getByLabelText('Probe value')).toHaveTextContent(emptyDisplay);
    });

    it('starts clean when a grid with the same name remounts', async () => {
      const first = await renderGrid('test_persistent_memory_remount', 'memory');
      await first.user.click(screen.getByRole('button', { name: 'Set probe' }));
      first.unmount();

      const second = await renderGrid('test_persistent_memory_remount', 'memory');
      await second.user.click(screen.getByRole('button', { name: 'Read probe' }));

      expect(screen.getByLabelText('Probe value')).toHaveTextContent(emptyDisplay);
    });
  });

  describe('router mode', () => {
    it('writes a plain state into the URL and reads it back', async () => {
      const { user } = await renderGrid('test_persistent_router', 'router');

      await user.click(screen.getByRole('button', { name: 'Set probe' }));

      expect(new URLSearchParams(window.location.search).get('probe')).toBe('{"page":2}');

      await user.click(screen.getByRole('button', { name: 'Read probe' }));
      expect(screen.getByLabelText('Probe value')).toHaveTextContent('{"page":2}');
    });

    it('neither writes nor reads a state registered with router: false', async () => {
      // Seed the URL as if a crafted link carried the opted-out state.
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}?optout=%7B%22page%22%3A9%7D`,
      );

      const { user } = await renderGrid('test_persistent_router_optout', 'router');

      // The seeded value is not readable…
      await user.click(screen.getByRole('button', { name: 'Read optout' }));
      expect(screen.getByLabelText('Optout value')).toHaveTextContent(emptyDisplay);

      // …and setValue leaves the URL untouched.
      await user.click(screen.getByRole('button', { name: 'Set optout' }));
      expect(new URLSearchParams(window.location.search).get('optout')).toBe('{"page":9}');
      await user.click(screen.getByRole('button', { name: 'Read optout' }));
      expect(screen.getByLabelText('Optout value')).toHaveTextContent(emptyDisplay);
    });

    it('ignores router: false under the other backends', async () => {
      const { user } = await renderGrid('test_persistent_router_optout_local');

      await user.click(screen.getByRole('button', { name: 'Set optout' }));

      expect(localStorage.getItem('dataGrid:test_persistent_router_optout_local:optout')).toBe(
        '{"page":2}',
      );
    });
  });

  describe('localStorage mode (default)', () => {
    it('persists state under the namespaced key when no mode is configured', async () => {
      const { user } = await renderGrid('test_persistent_default');

      await user.click(screen.getByRole('button', { name: 'Set probe' }));

      expect(localStorage.getItem('dataGrid:test_persistent_default:probe')).toBe('{"page":2}');
    });

    it('restores persisted state on remount', async () => {
      const first = await renderGrid('test_persistent_default_remount');
      await first.user.click(screen.getByRole('button', { name: 'Set probe' }));
      first.unmount();

      const second = await renderGrid('test_persistent_default_remount');
      await second.user.click(screen.getByRole('button', { name: 'Read probe' }));

      expect(screen.getByLabelText('Probe value')).toHaveTextContent('{"page":2}');
    });
  });

  describe('browser storage that refuses', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    // Where storage is blocked (a sandboxed or third-party iframe, "block all cookies"), reading
    // the `localStorage` property itself throws. Plugins read it while the grid renders, so an
    // uncaught throw here is a grid that never appears.
    it('renders and runs without persistence when reading localStorage throws', async () => {
      const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
      expect(original).toBeDefined();
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });

      try {
        const { user } = await renderGrid('test_persistent_blocked');
        expect(screen.getByLabelText('Probe value')).toHaveTextContent(emptyDisplay);

        await user.click(screen.getByRole('button', { name: 'Set probe' }));
        await user.click(screen.getByRole('button', { name: 'Read probe' }));

        // Nothing is remembered, and nothing broke.
        expect(screen.getByLabelText('Probe value')).toHaveTextContent(emptyDisplay);
      } finally {
        if (original) Object.defineProperty(globalThis, 'localStorage', original);
      }
    });

    it('reads a stored value as absent when getItem itself throws', async () => {
      localStorage.setItem('dataGrid:test_persistent_get_throws:probe', '{"page":2}');
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });

      await renderGrid('test_persistent_get_throws');

      expect(screen.getByLabelText('Probe value')).toHaveTextContent(emptyDisplay);
    });

    it('does not throw out of setValue when a write is refused', async () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('full', 'QuotaExceededError');
      });
      // An error thrown from a click handler is reported on the window, not to the caller.
      const errors: unknown[] = [];
      const onError = (event: ErrorEvent) => {
        errors.push(event.error);
        event.preventDefault();
      };
      window.addEventListener('error', onError);

      try {
        const { user } = await renderGrid('test_persistent_full');
        await user.click(screen.getByRole('button', { name: 'Set probe' }));

        expect(setItem).toHaveBeenCalled();
        expect(errors).toEqual([]);
      } finally {
        window.removeEventListener('error', onError);
      }
    });
  });

  describe('unparseable stored values', () => {
    it('reads a localStorage entry that is not JSON as an absent one', async () => {
      // What a user with devtools open, or a half-written entry, leaves behind. The grid reads
      // storage on every mount, so a throw here is one the user cannot get out of.
      localStorage.setItem('dataGrid:test_persistent_broken_local:probe', 'not-json{');

      const { user } = await renderGrid('test_persistent_broken_local');

      expect(screen.getByLabelText('Probe value')).toHaveTextContent(emptyDisplay);

      // The state is still writable, so the grid recovers on the next write.
      await user.click(screen.getByRole('button', { name: 'Set probe' }));
      await user.click(screen.getByRole('button', { name: 'Read probe' }));
      expect(screen.getByLabelText('Probe value')).toHaveTextContent('{"page":2}');
    });

    it('reads a URL parameter that is not JSON as an absent one', async () => {
      window.history.replaceState(null, '', `${window.location.pathname}?probe=%7Bbroken`);

      await renderGrid('test_persistent_broken_router', 'router');

      expect(screen.getByLabelText('Probe value')).toHaveTextContent(emptyDisplay);
    });
  });

  describe('storage override', () => {
    it('sends one state to its own backend while the grid uses another', async () => {
      const { user } = await renderOverrideGrid('test_override_session', undefined, {
        storage: 'sessionStorage',
      });

      await user.click(screen.getByRole('button', { name: 'Set override' }));

      expect(sessionStorage.getItem('dataGrid:test_override_session:override')).toBe('{"page":2}');
      expect(localStorage).toHaveLength(0);
    });

    it('keeps a state out of the URL when the grid persists to the router', async () => {
      const { user } = await renderOverrideGrid('test_override_local', 'router', {
        storage: 'localStorage',
      });

      await user.click(screen.getByRole('button', { name: 'Set override' }));

      expect(localStorage.getItem('dataGrid:test_override_local:override')).toBe('{"page":2}');
      expect(window.location.search).toBe('');
    });

    it('holds a state in memory while the grid persists to localStorage', async () => {
      const { user } = await renderOverrideGrid('test_override_memory', 'localStorage', {
        storage: 'memory',
      });

      await user.click(screen.getByRole('button', { name: 'Set override' }));
      await user.click(screen.getByRole('button', { name: 'Read override' }));

      expect(screen.getByLabelText('Override value')).toHaveTextContent('{"page":2}');
      expect(localStorage).toHaveLength(0);
      expect(sessionStorage).toHaveLength(0);
    });

    it('applies router: false against the backend the state named, not the grid-wide one', async () => {
      const { user } = await renderOverrideGrid('test_override_router_optout', 'localStorage', {
        storage: 'router',
        router: false,
      });

      await user.click(screen.getByRole('button', { name: 'Set override' }));

      expect(window.location.search).toBe('');
      expect(localStorage).toHaveLength(0);
    });

    it('follows the grid-wide mode when no backend is named', async () => {
      const { user } = await renderOverrideGrid('test_override_absent', 'router', {});

      await user.click(screen.getByRole('button', { name: 'Set override' }));

      expect(new URLSearchParams(window.location.search).get('override')).toBe('{"page":2}');
      expect(localStorage).toHaveLength(0);
    });
  });
});
