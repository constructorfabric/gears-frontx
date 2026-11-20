/**
 * Acceptance for the provider's `isTypeOf` and its infrastructure schema set
 * (`cpt-frontx-algo-gts-type-provider-typof-resolution`,
 * `cpt-frontx-algo-gts-type-provider-infra-registration-v2`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GtsPlugin } from '../plugin';
import { loadSchemas } from '../loader';
import { nodeSchema, resetRealm } from './realm-support';

beforeEach(() => {
  resetRealm();
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  resetRealm();
});

describe('isTypeOf', () => {
  const plugin = new GtsPlugin({ isolated: true });
  const base = 'gts.frontx.mfes.mfe.entry.v1~';

  it('is true for an identifier equal to the base and for one that starts with it', () => {
    expect(plugin.isTypeOf(base, base)).toBe(true);
    expect(plugin.isTypeOf(`${base}frontx.mfes.mfe.entry_mf.v1~`, base)).toBe(true);
    expect(plugin.isTypeOf(`${base}frontx.mfes.mfe.entry_mf.v1~acme.app.entry.v1`, base)).toBe(true);
  });

  it('is false for any other identifier', () => {
    expect(plugin.isTypeOf('gts.frontx.mfes.mfe.mf_manifest.v1~', base)).toBe(false);
    expect(plugin.isTypeOf('gts.frontx.mfes.mfe.entry.v1', `${base}x`)).toBe(false);
    expect(plugin.isTypeOf('', base)).toBe(false);
  });
});

describe('infrastructure schema set', () => {
  it('holds every ecosystem schema at construction and is unchanged by an application schema registered later', () => {
    const plugin = new GtsPlugin({ isolated: true });
    const infraIds = loadSchemas().map((schema) => String(schema.$id).replace(/^gts:\/\//, ''));
    expect(infraIds.length).toBeGreaterThan(0);
    const before = infraIds.map((id) => JSON.stringify(plugin.getSchema(id)));
    for (const id of infraIds) expect(plugin.getSchema(id)).toBeDefined();

    const appType = 'gts.acme.app.core.node.v1~';
    expect(plugin.getSchema(appType)).toBeUndefined();
    plugin.registerSchema(nodeSchema(appType));
    expect(plugin.getSchema(appType)).toBeDefined();

    expect(infraIds.map((id) => JSON.stringify(plugin.getSchema(id)))).toEqual(before);
    // An isolated provider constructed afterwards owns none of the application schemas.
    expect(new GtsPlugin({ isolated: true }).getSchema(appType)).toBeUndefined();
  });
});
