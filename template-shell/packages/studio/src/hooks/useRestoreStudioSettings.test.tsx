import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { eventBus } from '@gears-frontx/react';
import { STORAGE_KEYS } from '../types';
import { useRestoreStudioSettings } from './useRestoreStudioSettings';

vi.mock('@gears-frontx/react', () => ({
  eventBus: {
    emit: vi.fn(),
  },
}));

describe('useRestoreStudioSettings', () => {
  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('re-emits persisted theme, language, and mock settings once', () => {
    localStorage.setItem(STORAGE_KEYS.THEME, JSON.stringify('midnight'));
    localStorage.setItem(STORAGE_KEYS.LANGUAGE, JSON.stringify('fr'));
    localStorage.setItem(STORAGE_KEYS.MOCK_ENABLED, JSON.stringify(true));

    const { rerender } = renderHook(() => useRestoreStudioSettings());

    rerender();

    expect(eventBus.emit).toHaveBeenCalledTimes(3);
    expect(eventBus.emit).toHaveBeenNthCalledWith(1, 'theme/changed', { themeId: 'midnight' });
    expect(eventBus.emit).toHaveBeenNthCalledWith(2, 'i18n/language/changed', { language: 'fr' });
    expect(eventBus.emit).toHaveBeenNthCalledWith(3, 'mock/toggle', { enabled: true });
  });

  it('skips empty persisted values', () => {
    localStorage.setItem(STORAGE_KEYS.THEME, JSON.stringify(''));
    localStorage.setItem(STORAGE_KEYS.LANGUAGE, JSON.stringify(''));
    localStorage.setItem(STORAGE_KEYS.MOCK_ENABLED, JSON.stringify(null));

    renderHook(() => useRestoreStudioSettings());

    expect(eventBus.emit).not.toHaveBeenCalled();
  });
});
