import { describe, expect, it } from 'vitest';
import * as entry from '../index.js';

const EXPECTED_RUNTIME_EXPORTS = [
  'ExtensionRouter',
  'Link',
  'Outlet',
  'createRootRoute',
  'createRootRouteWithContext',
  'createRoute',
  'navigation',
  'notFound',
  'parseSearchWith',
  'redirect',
  'stringifySearchWith',
  'useNavigate',
  'useParams',
  'useRouterState',
  'useSearch',
];

describe('public entry', () => {
  it('exports exactly ExtensionRouter, navigation, the route-tree builders, the scoped route hooks and the search codec builders', () => {
    expect(Object.keys(entry).sort()).toEqual(EXPECTED_RUNTIME_EXPORTS);
  });

  it.each([
    'adaptProviderHistory',
    'createProviderRouter',
    'EngineProvider',
    'createRouter',
    'locationPreservingRedirect',
  ])('does not export %s', (name) => {
    expect(name in entry).toBe(false);
  });
});
