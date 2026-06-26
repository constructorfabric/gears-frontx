import { describe, expect, it, vi } from 'vitest';
import { eventBus } from '@gears-frontx/react';
import { StudioEvents } from '../events/studioEvents';
import { saveStudioState } from '../utils/persistence';
import { STORAGE_KEYS } from '../types';
import { initPersistenceEffects } from './persistenceEffects';

type EventBusOn = typeof eventBus.on;
type EventName = Parameters<EventBusOn>[0];
type EventHandler = Parameters<EventBusOn>[1];

vi.mock('@gears-frontx/react', () => ({
  eventBus: {
    on: vi.fn(),
  },
}));

vi.mock('../utils/persistence', () => ({
  saveStudioState: vi.fn(),
}));

describe('initPersistenceEffects', () => {
  it('persists studio and framework events and unsubscribes on cleanup', () => {
    const handlers = new Map<EventName, EventHandler>();
    const subscriptions = new Map<EventName, { unsubscribe: ReturnType<typeof vi.fn> }>();

    vi.mocked(eventBus.on).mockImplementation((event: EventName, handler: EventHandler) => {
      handlers.set(event, handler);
      const subscription = { unsubscribe: vi.fn() };
      subscriptions.set(event, subscription);
      return subscription;
    });

    const cleanup = initPersistenceEffects();

    handlers.get(StudioEvents.PositionChanged)?.({ position: { x: 1, y: 2 } });
    handlers.get(StudioEvents.SizeChanged)?.({ size: { width: 320, height: 400 } });
    handlers.get(StudioEvents.ButtonPositionChanged)?.({ position: { x: 3, y: 4 } });
    handlers.get('theme/changed')?.({ themeId: 'midnight' });
    handlers.get('i18n/language/changed')?.({ language: 'ar' });
    handlers.get('mock/toggle')?.({ enabled: true });

    expect(saveStudioState).toHaveBeenNthCalledWith(1, STORAGE_KEYS.POSITION, { x: 1, y: 2 });
    expect(saveStudioState).toHaveBeenNthCalledWith(2, STORAGE_KEYS.SIZE, { width: 320, height: 400 });
    expect(saveStudioState).toHaveBeenNthCalledWith(3, STORAGE_KEYS.BUTTON_POSITION, { x: 3, y: 4 });
    expect(saveStudioState).toHaveBeenNthCalledWith(4, STORAGE_KEYS.THEME, 'midnight');
    expect(saveStudioState).toHaveBeenNthCalledWith(5, STORAGE_KEYS.LANGUAGE, 'ar');
    expect(saveStudioState).toHaveBeenNthCalledWith(6, STORAGE_KEYS.MOCK_ENABLED, true);

    cleanup();

    expect(Array.from(handlers.keys())).toEqual(expect.arrayContaining([
      StudioEvents.PositionChanged,
      StudioEvents.SizeChanged,
      StudioEvents.ButtonPositionChanged,
      'theme/changed',
      'i18n/language/changed',
      'mock/toggle',
    ]));

    for (const eventName of [
      StudioEvents.PositionChanged,
      StudioEvents.SizeChanged,
      StudioEvents.ButtonPositionChanged,
      'theme/changed',
      'i18n/language/changed',
      'mock/toggle',
    ] satisfies EventName[]) {
      expect(subscriptions.get(eventName)?.unsubscribe).toHaveBeenCalledTimes(1);
    }
  });
});
