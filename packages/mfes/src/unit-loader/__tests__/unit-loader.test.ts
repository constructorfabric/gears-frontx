/**
 * Scenario coverage for the `./unit-loader` sanctioned subpath
 * (`cpt-frontx-algo-unit-format-contract-loader-surface`,
 * `cpt-frontx-dod-unit-format-contract-loader-surface`):
 *
 *  - the subpath yields exactly the shared-unit fetcher and the
 *    location-to-URL resolver, and no type;
 *  - its module graph reaches no registry, orchestrating handler or
 *    mediator module.
 */
import { describe, expect, it } from 'vitest';

import * as unitLoader from '../index';
import { SharedAssetUrlResolver, SharedUnitFetcher } from '../index';
import { SharedAssetUrlResolver as InternalSharedAssetUrlResolver } from '../../handler/mfe-handler-mf/SharedAssetUrlResolver';
import { SharedUnitFetcher as InternalSharedUnitFetcher } from '../../handler/mfe-handler-mf/SharedUnitFetcher';
import { exportedNames, reachableModules } from '../../__tests__/helpers/exported-names';

describe('unit-loader subpath surface', () => {
  it('exports exactly the shared-unit fetcher and the resolver', () => {
    expect(SharedUnitFetcher).toBe(InternalSharedUnitFetcher);
    expect(SharedAssetUrlResolver).toBe(InternalSharedAssetUrlResolver);
    expect(Object.keys(unitLoader).sort()).toEqual([
      'SharedAssetUrlResolver',
      'SharedUnitFetcher',
    ]);
  });

  it('exports no type', () => {
    expect(exportedNames('unit-loader/index.ts')).toEqual([
      'SharedAssetUrlResolver',
      'SharedUnitFetcher',
    ]);
  });

  it('reaches no registry, orchestrating handler or mediator module', () => {
    const modules = reachableModules('unit-loader/index.ts');
    expect(modules).toContain('handler/mfe-handler-mf/SharedUnitFetcher.ts');
    for (const module of modules) {
      expect(module).not.toMatch(/MfeHandlerMF\.ts$/);
      expect(module).not.toMatch(/^registry\//);
      expect(module).not.toMatch(/^mediator\//);
      expect(module).not.toMatch(/Registry/);
      expect(module).not.toMatch(/^runtime\//);
      expect(module).not.toMatch(/mf-dynamic-module-ops|SharedDepListMinter|UnitDynamicImportRewriter/);
    }
  });
});
