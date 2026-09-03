import { act, renderHook } from '@testing-library/react';
import { FRONTX_SHARED_PROPERTY_THEME } from '@gears-frontx/react';
import { createMfeBridgeFixture } from '@frontx-test-utils/createMfeBridgeFixture';
import { describe, expect, it } from 'vitest';
import { useBridgeProperty } from './useBridgeProperty';

const TEST_DOMAIN_ID = 'test-domain';
const TEST_INSTANCE_ID = 'test-instance';

function themeBridgeFixture(
  initialProperties: Record<string, string | undefined> = {}
) {
  return createMfeBridgeFixture({
    extDomainId: TEST_DOMAIN_ID,
    extensionId: TEST_INSTANCE_ID,
    initialProperties,
  });
}

describe('useBridgeProperty', () => {
  it('reads the initial value from the bridge on first render', () => {
    const { bridge } = themeBridgeFixture({
      [FRONTX_SHARED_PROPERTY_THEME]: 'initial-theme',
    });

    const { result } = renderHook(() =>
      useBridgeProperty(bridge, FRONTX_SHARED_PROPERTY_THEME, 'fallback-theme')
    );

    expect(result.current).toBe('initial-theme');
  });

  it('returns the fallback when the property is unset', () => {
    // No property registered at all: getProperty returns undefined.
    const { bridge } = themeBridgeFixture();

    const { result } = renderHook(() =>
      useBridgeProperty(bridge, FRONTX_SHARED_PROPERTY_THEME, 'fallback-theme')
    );

    expect(result.current).toBe('fallback-theme');
  });

  it('returns the fallback when the property value is not a string', () => {
    // Property registered, but its value is undefined rather than a string.
    const { bridge } = themeBridgeFixture({
      [FRONTX_SHARED_PROPERTY_THEME]: undefined,
    });

    const { result } = renderHook(() =>
      useBridgeProperty(bridge, FRONTX_SHARED_PROPERTY_THEME, 'fallback-theme')
    );

    expect(result.current).toBe('fallback-theme');
  });

  it('reacts to property updates', () => {
    const fixture = themeBridgeFixture({
      [FRONTX_SHARED_PROPERTY_THEME]: 'initial-theme',
    });

    const { result } = renderHook(() =>
      useBridgeProperty(fixture.bridge, FRONTX_SHARED_PROPERTY_THEME, 'fallback-theme')
    );

    act(() => {
      fixture.setProperty(FRONTX_SHARED_PROPERTY_THEME, 'updated-theme');
    });

    expect(result.current).toBe('updated-theme');
  });

  it('keeps the last string value when a non-string update arrives', () => {
    const fixture = themeBridgeFixture({
      [FRONTX_SHARED_PROPERTY_THEME]: 'initial-theme',
    });

    const { result } = renderHook(() =>
      useBridgeProperty(fixture.bridge, FRONTX_SHARED_PROPERTY_THEME, 'fallback-theme')
    );

    act(() => {
      fixture.setProperty(FRONTX_SHARED_PROPERTY_THEME, 'updated-theme');
    });
    act(() => {
      fixture.setProperty(FRONTX_SHARED_PROPERTY_THEME, undefined);
    });

    expect(result.current).toBe('updated-theme');
  });

  it('unsubscribes on unmount', () => {
    const fixture = themeBridgeFixture({
      [FRONTX_SHARED_PROPERTY_THEME]: 'initial-theme',
    });

    const { unmount } = renderHook(() =>
      useBridgeProperty(fixture.bridge, FRONTX_SHARED_PROPERTY_THEME, 'fallback-theme')
    );

    unmount();

    expect(fixture.unsubscriptions).toHaveLength(1);
    for (const { unsubscribe } of fixture.unsubscriptions) {
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    }
  });

  it('re-reads the current value when the host swaps the bridge instance', () => {
    const first = themeBridgeFixture({
      [FRONTX_SHARED_PROPERTY_THEME]: 'first-theme',
    });
    const second = themeBridgeFixture({
      [FRONTX_SHARED_PROPERTY_THEME]: 'second-theme',
    });

    const { result, rerender } = renderHook(
      ({ bridge }) => useBridgeProperty(bridge, FRONTX_SHARED_PROPERTY_THEME, 'fallback-theme'),
      { initialProps: { bridge: first.bridge } }
    );

    expect(result.current).toBe('first-theme');

    rerender({ bridge: second.bridge });

    // The new bridge's current value is re-read during render — its
    // subscription only delivers future changes and never fires here.
    expect(result.current).toBe('second-theme');

    // The old bridge's subscription was torn down and re-registered on the
    // new instance.
    expect(first.unsubscriptions).toHaveLength(1);
    for (const { unsubscribe } of first.unsubscriptions) {
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    }
    expect(second.subscribeToProperty).toHaveBeenCalledTimes(1);

    // Updates published through the new bridge still flow into the hook.
    act(() => {
      second.setProperty(FRONTX_SHARED_PROPERTY_THEME, 'second-theme-updated');
    });

    expect(result.current).toBe('second-theme-updated');
  });
});
