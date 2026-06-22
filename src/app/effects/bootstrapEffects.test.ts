import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Language, setHeaderLoading, setUser } from '@gears-frontx/react';
import { UserRole } from '@/app/api/types';

type BootstrapUserSnapshot = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  language: Language;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
};

/** Payloads emitted on the bus in these tests (fetch has none; loaded carries user). */
type BootstrapTestBusPayload =
  | undefined
  | {
      user: BootstrapUserSnapshot;
    };

type BootstrapEventHandler = (
  payload?: BootstrapTestBusPayload,
) => void | Promise<void>;

const listeners = new Map<string, Array<BootstrapEventHandler>>();
const mockHas = vi.fn();
const mockGetService = vi.fn();
const spyCleanups: Array<() => void> = [];

function mockConsoleWarn() {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  spyCleanups.push(() => {
    warnSpy.mockReset();
    warnSpy.mockRestore();
  });
  return warnSpy;
}

vi.mock('@gears-frontx/react', async (importOriginal) => ({
  ...(await importOriginal()),
  eventBus: {
    on: vi.fn((eventName: string, handler: BootstrapEventHandler) => {
      const handlers = listeners.get(eventName) ?? [];
      handlers.push(handler);
      listeners.set(eventName, handlers);
      return () => {
        listeners.set(
          eventName,
          (listeners.get(eventName) ?? []).filter((candidate) => candidate !== handler),
        );
      };
    }),
    emit: async (eventName: string, payload?: BootstrapTestBusPayload) => {
      const handlers = listeners.get(eventName) ?? [];
      await Promise.all(handlers.map((handler) => handler(payload)));
    },
  },
  apiRegistry: {
    has: (svc: abstract new (...args: never[]) => Record<string, never>) =>
      mockHas(svc),
    getService: (svc: abstract new (...args: never[]) => Record<string, never>) =>
      mockGetService(svc),
  },
}));

vi.mock('@/app/api', () => ({
  AccountsApiService: class MockAccountsApiService {
    static {
      void 0;
    }
  },
}));

async function emitEvent(event: string, payload?: BootstrapTestBusPayload): Promise<void> {
  const handlers = listeners.get(event) ?? [];
  await Promise.all(handlers.map((handler) => handler(payload)));
}

function getDispatchedActions(dispatch: ReturnType<typeof vi.fn>) {
  return dispatch.mock.calls.map(([action]) => action);
}

describe('registerBootstrapEffects', () => {
  beforeEach(() => {
    listeners.clear();
    mockHas.mockReset();
    mockGetService.mockReset();
    spyCleanups.length = 0;
  });

  afterEach(() => {
    while (spyCleanups.length > 0) {
      spyCleanups.pop()?.();
    }
  });

  it('does nothing when the accounts service is not registered', async () => {
    mockHas.mockReturnValue(false);
    const dispatch = vi.fn();
    const { registerBootstrapEffects } = await import('./bootstrapEffects');

    registerBootstrapEffects(dispatch);
    await emitEvent('app/user/fetch');

    expect(mockHas).toHaveBeenCalledTimes(1);
    expect(mockGetService).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('dispatches header slice actions when the bootstrap adapter loads the current user', async () => {
    mockHas.mockReturnValue(true);
    mockGetService.mockReturnValue({
      getCurrentUser: {
        fetch: vi.fn().mockResolvedValue({
          user: {
            id: 'user-ada',
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.com',
            role: UserRole.User,
            language: Language.English,
            avatarUrl: 'https://example.com/avatar.png',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
      },
    });
    const dispatch = vi.fn();
    const { registerBootstrapEffects } = await import('./bootstrapEffects');

    registerBootstrapEffects(dispatch);
    await emitEvent('app/user/fetch');

    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(getDispatchedActions(dispatch)).toEqual([
      setHeaderLoading(true),
      setUser({
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
        avatarUrl: 'https://example.com/avatar.png',
      }),
      setHeaderLoading(false),
    ]);
  });

  it('clears header loading when the fetch fails', async () => {
    const warnSpy = mockConsoleWarn();
    const error = new Error('boom');
    mockHas.mockReturnValue(true);
    mockGetService.mockReturnValue({
      getCurrentUser: {
        fetch: vi.fn().mockRejectedValue(error),
      },
    });
    const dispatch = vi.fn();
    const { registerBootstrapEffects } = await import('./bootstrapEffects');

    registerBootstrapEffects(dispatch);
    await emitEvent('app/user/fetch');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('Failed to fetch user');
    expect(warnSpy.mock.calls[0]?.[1]).toBe(error);
    expect(getDispatchedActions(dispatch)).toEqual([
      setHeaderLoading(true),
      setHeaderLoading(false),
    ]);
  });

  it('warns instead of throwing when service availability lookup fails synchronously', async () => {
    const warnSpy = mockConsoleWarn();
    const error = new Error('registry has failed');
    mockHas.mockImplementation(() => {
      throw error;
    });
    const dispatch = vi.fn();
    const { registerBootstrapEffects } = await import('./bootstrapEffects');

    registerBootstrapEffects(dispatch);
    await emitEvent('app/user/fetch');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('Failed to fetch user');
    expect(warnSpy.mock.calls[0]?.[1]).toBe(error);
    expect(mockGetService).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('clears header loading when service lookup throws synchronously', async () => {
    const warnSpy = mockConsoleWarn();
    const error = new Error('registry misconfigured');
    mockHas.mockReturnValue(true);
    mockGetService.mockImplementation(() => {
      throw error;
    });
    const dispatch = vi.fn();
    const { registerBootstrapEffects } = await import('./bootstrapEffects');

    registerBootstrapEffects(dispatch);
    await emitEvent('app/user/fetch');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('Failed to fetch user');
    expect(warnSpy.mock.calls[0]?.[1]).toBe(error);
    expect(getDispatchedActions(dispatch)).toEqual([
      setHeaderLoading(true),
      setHeaderLoading(false),
    ]);
  });

  it('dispatches header slice actions when the bootstrap adapter receives app/user/loaded', async () => {
    const dispatch = vi.fn();
    const { registerBootstrapEffects } = await import('./bootstrapEffects');

    registerBootstrapEffects(dispatch);
    await emitEvent('app/user/loaded', {
      user: {
        id: 'user-grace',
        firstName: 'Grace',
        lastName: '  ',
        email: '',
        role: UserRole.User,
        language: Language.English,
        avatarUrl: undefined,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    expect(getDispatchedActions(dispatch)).toContainEqual(setUser({
      displayName: 'Grace',
      email: undefined,
      avatarUrl: undefined,
    }));
  });
});
