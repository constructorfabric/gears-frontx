import { beforeEach, describe, expect, it } from 'vitest';
import { FRONTX_SHARED_PROPERTY_THEME } from '@gears-frontx/react';
import { createBridgeFixture } from '../__test-utils__/bridgeFixture';
import { assertPreferredTheme, collapseHostMenuOnce } from './workspaceChrome';
import { CHROME_SET_MENU_COLLAPSED, CHROME_SET_THEME } from './hostChromeActions';

const hostOn = (themeId: string) =>
  createBridgeFixture({ [FRONTX_SHARED_PROPERTY_THEME]: themeId });

describe('workspace chrome requests', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('asks for the dark default only while the host disagrees', () => {
    const light = hostOn('light');
    expect(assertPreferredTheme(light.bridge)).toBe('dark');
    const [chain] = light.executeActionsChain.mock.calls[0];
    expect(chain.action.type).toBe(CHROME_SET_THEME);
    expect(chain.action.payload).toEqual({ themeId: 'dark' });

    // The same call on a remount, with the host already dark, must be silent -
    // this is what lets it run on every screen swap without fighting the user.
    const dark = hostOn('dark');
    assertPreferredTheme(dark.bridge);
    expect(dark.executeActionsChain).not.toHaveBeenCalled();
  });

  it('narrows the menu once per tab', () => {
    const first = hostOn('dark');
    collapseHostMenuOnce(first.bridge);
    const [chain] = first.executeActionsChain.mock.calls[0];
    expect(chain.action.type).toBe(CHROME_SET_MENU_COLLAPSED);
    expect(chain.action.payload).toEqual({ collapsed: true });

    const second = hostOn('dark');
    collapseHostMenuOnce(second.bridge);
    expect(second.executeActionsChain).not.toHaveBeenCalled();
  });
});
