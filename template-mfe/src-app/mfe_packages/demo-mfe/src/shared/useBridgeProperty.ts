/**
 * useBridgeProperty Hook
 *
 * Subscribes a screen to one of the host's shared bridge properties
 * (e.g. theme or language) and keeps the returned value in sync:
 *
 * 1. Reads the initial value lazily during the first render, so the first
 *    paint already reflects the host's current property (no extra render
 *    from a mount effect).
 * 2. Re-reads the current value during render when the host swaps the
 *    bridge instance ("adjusting state during render") — the subscription
 *    only delivers future changes, never the new bridge's current state.
 * 3. Subscribes to subsequent property changes and unsubscribes on
 *    unmount or bridge/property change.
 *
 * Deliberately not useSyncExternalStore: a host publishing a non-string
 * value must not flash the UI back to the fallback ('default'/'en'), so
 * the hook keeps the last string value — which a re-reading getSnapshot
 * cannot express.
 *
 * Related: useSharedProperty in @gears-frontx/react is the same concept,
 * but it pulls the bridge from MfeContext (which demo-mfe never mounts)
 * and has no fallback or non-string filtering; this hook takes the bridge
 * as an argument instead.
 *
 * Usage in screen component:
 * ```tsx
 * const theme = useBridgeProperty(bridge, FRONTX_SHARED_PROPERTY_THEME, 'default');
 * const language = useBridgeProperty(bridge, FRONTX_SHARED_PROPERTY_LANGUAGE, 'en');
 * ```
 */

import { useEffect, useState } from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';

/**
 * Hook returning the live value of a shared bridge property.
 *
 * @param bridge - ChildMfeBridge instance
 * @param propertyId - Shared property id (e.g. FRONTX_SHARED_PROPERTY_THEME).
 *   Must stay constant for the component's lifetime: the render-time resync
 *   compares only bridge instances, so a changed id would keep returning the
 *   old property's value until the new one publishes.
 * @param fallback - Value used while the property is unset or non-string
 *   on read; a later non-string update keeps the last string value instead
 * @returns The current string value of the property
 */
export function useBridgeProperty(
  bridge: ChildMfeBridge,
  propertyId: string,
  fallback: string
): string {
  const [value, setValue] = useState<string>(() =>
    readBridgeProperty(bridge, propertyId, fallback)
  );
  const [prevBridge, setPrevBridge] = useState(bridge);
  if (prevBridge !== bridge) {
    setPrevBridge(bridge);
    setValue(readBridgeProperty(bridge, propertyId, fallback));
  }

  useEffect(() => {
    return bridge.subscribeToProperty(propertyId, (property) => {
      if (typeof property.value === 'string') {
        setValue(property.value);
      }
    });
  }, [bridge, propertyId]);

  return value;
}

function readBridgeProperty(bridge: ChildMfeBridge, propertyId: string, fallback: string): string {
  const current = bridge.getProperty(propertyId);
  return current && typeof current.value === 'string' ? current.value : fallback;
}
