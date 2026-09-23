// `mfes` and `@gears-frontx/routing` each carry their own copy of the same
// route/extension-token `name` alphabet (lower-case letter, then lower-case
// letters/digits/`-`) because neither package may depend on the other, not
// even for types (internal/depcruise-config/core.cjs,
// internal/depcruise-config/layer-constants.cjs). This test is the one place
// outside both packages that proves the two copies still agree — it imports
// each package's own built, published surface (never source internals) and
// runs both over one shared list of names.
import { describe, it, expect } from 'vitest';
import { validateName, namesEqual, deriveExtensionToken } from '@gears-frontx/routing';
import { isValidRouteName, routeNamesEqual, getExtensionRouteToken } from '@gears-frontx/mfes';

// One shared list of valid and invalid names, covering the alphabet's edges.
const NAMES = [
  'a',
  'abc',
  'a-b',
  'a1',
  'a--b',
  'a-',
  'Abc', // upper case
  '1a', // leading digit
  '-a', // leading '-'
  '', // empty
  ' a', // leading space
  'a b', // internal space
  'a.b', // '.'
  'a/b', // '/'
  'a_b', // '_'
  'ä', // unicode
  '/abc', // one leading slash (valid as a route, not as a bare name)
  '//abc', // two leading slashes
];

describe('routing/mfes name-alphabet agreement', () => {
  describe('validity', () => {
    for (const name of NAMES) {
      it(`mfes.isValidRouteName and routing.validateName agree on ${JSON.stringify(name)}`, () => {
        expect(isValidRouteName(name)).toBe(validateName(name));
      });
    }
  });

  describe('equality', () => {
    for (const a of NAMES) {
      for (const b of NAMES) {
        it(`mfes.routeNamesEqual and routing.namesEqual agree on ${JSON.stringify(a)} vs ${JSON.stringify(b)}`, () => {
          expect(routeNamesEqual(a, b)).toBe(namesEqual(a, b));
        });
      }
    }
  });

  describe('token derivation', () => {
    for (const route of NAMES) {
      it(`mfes.getExtensionRouteToken({ route }) and routing.deriveExtensionToken(route) agree for ${JSON.stringify(route)}`, () => {
        expect(getExtensionRouteToken({ id: 'x', domain: 'd', entry: 'e', route })).toBe(
          deriveExtensionToken(route)
        );
      });
    }

    it('agree on an extension declaring no route at all', () => {
      const extension = { id: 'x', domain: 'd', entry: 'e' };
      expect(getExtensionRouteToken(extension)).toBe(deriveExtensionToken(undefined));
      expect(getExtensionRouteToken(extension)).toBeUndefined();
    });
  });
});
