import { describe, it, expect } from 'vitest';
// @internal — colocated test, direct relative import is permitted.
import {
  isValidRouteName,
  routeNamesEqual,
  getDeclaredRoute,
  getExtensionRouteToken,
} from '../index';
import type { Extension } from '../../types';

describe('isValidRouteName', () => {
  it.each(['a', 'abc', 'a-b', 'a1', 'a--b', 'a-'])('accepts %j', (candidate) => {
    expect(isValidRouteName(candidate)).toBe(true);
  });

  it.each(['Abc', '1a', '-a', '', ' a', 'a b', 'a.b', 'a/b', 'a_b', 'ä'])(
    'rejects %j',
    (candidate) => {
      expect(isValidRouteName(candidate)).toBe(false);
    }
  );
});

describe('routeNamesEqual', () => {
  it('is true for identical strings', () => {
    expect(routeNamesEqual('settings', 'settings')).toBe(true);
  });

  it('is false for different strings, including case-only differences', () => {
    expect(routeNamesEqual('settings', 'Settings')).toBe(false);
    expect(routeNamesEqual('settings', 'billing')).toBe(false);
  });
});

describe('getDeclaredRoute', () => {
  const base = { id: 'ext-1', domain: 'd1', entry: 'entry-1' };

  it('returns the base route when present', () => {
    const extension: Extension = { ...base, route: 'profile' };
    expect(getDeclaredRoute(extension)).toBe('profile');
  });

  it('falls back to presentation.route when base route is absent', () => {
    const extension = {
      ...base,
      presentation: { label: 'Settings', route: 'settings' },
    } as unknown as Extension;
    expect(getDeclaredRoute(extension)).toBe('settings');
  });

  it('prefers the base route over presentation.route when both are set', () => {
    const extension = {
      ...base,
      route: 'profile',
      presentation: { label: 'Settings', route: 'settings' },
    } as unknown as Extension;
    expect(getDeclaredRoute(extension)).toBe('profile');
  });

  it('returns undefined when neither is set', () => {
    expect(getDeclaredRoute({ ...base })).toBeUndefined();
  });

  it('returns undefined when presentation exists but its route is not a string', () => {
    const extension = {
      ...base,
      presentation: { label: 'Settings' },
    } as unknown as Extension;
    expect(getDeclaredRoute(extension)).toBeUndefined();
  });

  it.each([null, 123, {}, false])(
    'treats a non-string base route (%j) as absent, without throwing, and falls through to a string presentation.route',
    (badRoute) => {
      const withoutPresentation = { ...base, route: badRoute } as unknown as Extension;
      expect(() => getDeclaredRoute(withoutPresentation)).not.toThrow();
      expect(getDeclaredRoute(withoutPresentation)).toBeUndefined();

      const withPresentation = {
        ...base,
        route: badRoute,
        presentation: { label: 'Settings', route: 'settings' },
      } as unknown as Extension;
      expect(getDeclaredRoute(withPresentation)).toBe('settings');
    }
  );

  it('returns undefined, without throwing, when presentation itself is null', () => {
    const extension = { ...base, presentation: null } as unknown as Extension;
    expect(() => getDeclaredRoute(extension)).not.toThrow();
    expect(getDeclaredRoute(extension)).toBeUndefined();
  });

  it('returns undefined, without throwing, when presentation is not an object', () => {
    const extension = { ...base, presentation: 'oops' } as unknown as Extension;
    expect(() => getDeclaredRoute(extension)).not.toThrow();
    expect(getDeclaredRoute(extension)).toBeUndefined();
  });
});

describe('getExtensionRouteToken', () => {
  const base = { id: 'ext-1', domain: 'd1', entry: 'entry-1' };

  it('derives the token from a valid base route', () => {
    const extension: Extension = { ...base, route: 'profile' };
    expect(getExtensionRouteToken(extension)).toBe('profile');
  });

  it('strips exactly one leading slash', () => {
    const extension: Extension = { ...base, route: '/profile' };
    expect(getExtensionRouteToken(extension)).toBe('profile');
  });

  it('is undefined when the stripped value still fails the alphabet (e.g. a second leading slash)', () => {
    const extension: Extension = { ...base, route: '//profile' };
    expect(getExtensionRouteToken(extension)).toBeUndefined();
  });

  it('is undefined for an invalid route', () => {
    const extension: Extension = { ...base, route: 'Not Valid' };
    expect(getExtensionRouteToken(extension)).toBeUndefined();
  });

  it('is undefined when no route is declared at all', () => {
    expect(getExtensionRouteToken({ ...base })).toBeUndefined();
  });

  it('falls back to presentation.route when base route is absent', () => {
    const extension = {
      ...base,
      presentation: { label: 'Settings', route: '/settings' },
    } as unknown as Extension;
    expect(getExtensionRouteToken(extension)).toBe('settings');
  });

  it.each([null, 123, {}, false])(
    'does not throw for a non-string base route (%j); the extension is simply not routable via it',
    (badRoute) => {
      const extension = { ...base, route: badRoute } as unknown as Extension;
      expect(() => getExtensionRouteToken(extension)).not.toThrow();
      expect(getExtensionRouteToken(extension)).toBeUndefined();
    }
  );

  it('does not throw when presentation is null', () => {
    const extension = { ...base, presentation: null } as unknown as Extension;
    expect(() => getExtensionRouteToken(extension)).not.toThrow();
    expect(getExtensionRouteToken(extension)).toBeUndefined();
  });

  it('does not throw when presentation.route is non-string', () => {
    const extension = {
      ...base,
      presentation: { label: 'Settings', route: 42 },
    } as unknown as Extension;
    expect(() => getExtensionRouteToken(extension)).not.toThrow();
    expect(getExtensionRouteToken(extension)).toBeUndefined();
  });
});
