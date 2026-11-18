/**
 * Closure of the built-in types: every final type rejects a property it does
 * not list — at its top level and in every inline object it declares — while
 * the abstract base types stay open for derivation. Runs the real shipped
 * schemas through `GtsPlugin`; the verdict is the GTS library's.
 *
 * @cpt-algo:cpt-frontx-algo-gts-type-provider-type-closure:p1
 * @cpt-dod:cpt-frontx-dod-gts-type-provider-closed-types:p1
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { GtsPlugin } from '../plugin';
import { resetRealm } from './realm-support';

const SCHEMA = 'https://json-schema.org/draft/2020-12/schema';
const STAGE_INIT = 'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1';
const MOUNT_EXT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~';
const LOAD_EXT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1~';
const UNMOUNT_EXT = 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.unmount_ext.v1~';
const DOMAIN_TYPE = 'gts.frontx.mfes.ext.domain.v1~';
const EXT_TYPE = 'gts.frontx.mfes.ext.extension.v1~';
const ENTRY_TYPE = 'gts.frontx.mfes.mfe.entry.v1~';
const ENTRY_MF_TYPE = `${ENTRY_TYPE}frontx.mfes.mfe.entry_mf.v1~`;
const MANIFEST_TYPE = 'gts.frontx.mfes.mfe.mf_manifest.v1~';
const STAGE_TYPE = 'gts.frontx.mfes.lifecycle.stage.v1~';
const HASH = 'a'.repeat(64);

const DOMAIN_ID = `${DOMAIN_TYPE}test.closure.fixture.domain.v1`;
const OTHER_DOMAIN_ID = `${DOMAIN_TYPE}test.closure.fixture.other.v1`;
const EXT_ID = `${EXT_TYPE}test.closure.fixture.ext.v1`;
const MANIFEST_ID = `${MANIFEST_TYPE}test.closure.fixture.manifest.v1`;
const ENTRY0_ID = `${ENTRY_TYPE}test.closure.fixture.entry0.v1`;
const BASE_ENTRY_ID = `${ENTRY_TYPE}test.closure.fixture.baseentry.v1`;

let seq = 0;
let plugin: GtsPlugin;

type Obj = Record<string, unknown>;

const domain = (extra: Obj = {}): Obj => ({
  id: `${DOMAIN_TYPE}test.closure.fixture.d${seq++}.v1`,
  sharedProperties: [],
  actions: [],
  extensionsActions: [],
  defaultActionTimeout: 5000,
  lifecycleStages: [],
  extensionsLifecycleStages: [],
  ...extra,
});

const mountAction = (extra: Obj = {}): Obj => ({
  type: MOUNT_EXT,
  target: DOMAIN_ID,
  payload: { subject: EXT_ID },
  ...extra,
});

const manifest = (over: Obj = {}): Obj => ({
  id: `${MANIFEST_TYPE}test.closure.fixture.m${seq++}.v1`,
  metaData: { publicPath: 'https://cdn.example.com/mfe/' },
  shared: [{ name: 'react', version: '19.2.4', chunkPath: 'shared/react.js' }],
  ...over,
});

const assets = (): Obj => ({ js: { sync: ['a.js'] }, css: { sync: [], async: [] } });

const entry = (over: Obj = {}): Obj => ({
  id: `${ENTRY_MF_TYPE}test.closure.fixture.e${seq++}.v1`,
  requiredProperties: [],
  actions: [],
  domainActions: [],
  manifest: MANIFEST_ID,
  exposedModule: './lifecycle',
  exposeAssets: assets(),
  ...over,
});

const accepts = (entity: unknown) => expect(() => plugin.register(entity)).not.toThrow();
const rejects = (entity: unknown, reason: RegExp = /Reason: [^\n]*(unevaluated|additional)/i) =>
  expect(() => plugin.register(entity)).toThrow(reason);

beforeEach(() => {
  resetRealm();
  plugin = new GtsPlugin({ isolated: true });
  plugin.register({ id: ENTRY0_ID, requiredProperties: [], actions: [], domainActions: [] });
  plugin.register(domain({ id: DOMAIN_ID }));
  plugin.register(domain({ id: OTHER_DOMAIN_ID }));
  plugin.register({ id: EXT_ID, domain: DOMAIN_ID, entry: ENTRY0_ID });
  plugin.register({ id: MANIFEST_ID, metaData: { publicPath: '/' }, shared: [] });
});

describe('final types reject an unknown top-level property', () => {
  it('domain', () => {
    accepts(domain());
    rejects(domain({ unknown: 1 }));
  });

  it('lifecycle stage', () => {
    accepts({ id: `${STAGE_TYPE}test.closure.fixture.s1.v1`, description: 'x' });
    rejects({ id: `${STAGE_TYPE}test.closure.fixture.s2.v1`, unknown: 1 });
  });

  it('manifest', () => {
    accepts(manifest());
    rejects(manifest({ unknown: 1 }));
  });

  it('MFE entry', () => {
    accepts(entry());
    rejects(entry({ unknown: 1 }));
  });

  it.each([MOUNT_EXT, UNMOUNT_EXT, LOAD_EXT])('action %s', (type) => {
    accepts({ type, target: DOMAIN_ID, payload: { subject: EXT_ID } });
    rejects({ type, target: DOMAIN_ID, payload: { subject: EXT_ID }, unknown: 1 });
  });
});

describe('final types reject an unknown property in each inline object', () => {
  it('manifest metaData', () => {
    rejects(manifest({ metaData: { publicPath: '/', unknown: 1 } }));
  });

  it('each manifest shared element', () => {
    rejects(manifest({ shared: [{ name: 'a', version: '1', chunkPath: 'a.js', unknown: 1 }] }));
  });

  it('each manifest entryLists value', () => {
    accepts(manifest({ entryLists: { './a': { location: 'a.json', contentHash: HASH }, './b': { location: 'b.json', contentHash: HASH } } }));
    rejects(manifest({ entryLists: { './a': { location: 'a.json', contentHash: HASH, unknown: 1 } } }));
  });

  it.each(['exposeAssets', 'js', 'css'])('entry exposeAssets %s', (where) => {
    const a = assets() as Record<string, Obj>;
    if (where === 'exposeAssets') (a as Obj).unknown = 1;
    else a[where].unknown = 1;
    rejects(entry({ exposeAssets: a }));
  });

  it.each([MOUNT_EXT, UNMOUNT_EXT, LOAD_EXT])('payload of action %s', (type) => {
    rejects({ type, target: DOMAIN_ID, payload: { subject: EXT_ID, unknown: 1 } });
  });
});

describe('a $ref to a final type is closed by that type', () => {
  const hook = (extra: Obj = {}): Obj => ({
    stage: STAGE_INIT,
    actions_chain: { action: mountAction() },
    ...extra,
  });

  it('a domain lifecycle item is closed by the hook type', () => {
    accepts(domain({ lifecycle: [hook()] }));
    rejects(domain({ lifecycle: [hook({ unknown: 1 })] }));
  });

  it('an extension lifecycle item is closed by the hook type', () => {
    accepts({ id: `${EXT_TYPE}test.closure.fixture.x1.v1`, domain: DOMAIN_ID, entry: ENTRY0_ID, lifecycle: [hook()] });
    rejects({ id: `${EXT_TYPE}test.closure.fixture.x2.v1`, domain: DOMAIN_ID, entry: ENTRY0_ID, lifecycle: [hook({ unknown: 1 })] });
  });

  it('a hook actions_chain is closed by the actions chain type', () => {
    rejects(domain({ lifecycle: [hook({ actions_chain: { action: mountAction(), unknown: 1 } })] }));
  });

  it('a chain next and fallback are closed by the actions chain type', () => {
    const chain = { action: mountAction() };
    accepts(domain({ lifecycle: [hook({ actions_chain: { ...chain, next: chain, fallback: chain } })] }));
    rejects(domain({ lifecycle: [hook({ actions_chain: { ...chain, next: { ...chain, unknown: 1 } } })] }));
    rejects(domain({ lifecycle: [hook({ actions_chain: { ...chain, fallback: { ...chain, unknown: 1 } } })] }));
  });
});

describe('abstract base types stay open', () => {
  const derived = (base: string, suffix: string, extraProps: Obj, required: string[] = []) => {
    const id = `${base}test.closure.fixture.${suffix}.v1~`;
    plugin.registerSchema({
      $id: `gts://${id}`,
      $schema: SCHEMA,
      allOf: [{ $ref: `gts://${base}` }],
      properties: extraProps as never,
      required,
    });
    return id;
  };

  it('the base action, referenced by an actions chain, accepts a property of its own', () => {
    accepts(domain({ lifecycle: [{ stage: STAGE_INIT, actions_chain: { action: mountAction({ extra: 1 }) } }] }));
  });

  it('a concrete action with an extra property is open inside next and fallback, and rejected when registered as its own type', () => {
    const chain = { action: mountAction({ extra: 1 }) };
    accepts(domain({ lifecycle: [{ stage: STAGE_INIT, actions_chain: { action: mountAction(), next: chain, fallback: chain } }] }));
    rejects(mountAction({ extra: 1 }));
  });

  it('a type derived from the base entry adds a property', () => {
    const type = derived(ENTRY_TYPE, 'entryx', { flavour: { type: 'string' } });
    accepts({ id: `${type}test.closure.fixture.inst.v1`, requiredProperties: [], actions: [], domainActions: [], flavour: 'a' });
  });

  it('a type derived from the extension adds a property', () => {
    const type = derived(EXT_TYPE, 'extx', { slot: { type: 'string' } });
    accepts({ id: `${type}test.closure.fixture.inst.v1`, domain: DOMAIN_ID, entry: ENTRY0_ID, slot: 's' });
  });

  it('a type derived from the shared property adds a property', () => {
    const type = derived('gts.frontx.mfes.comm.shared_property.v1~', 'propx', { unit: { type: 'string' } });
    accepts({ id: `${type}test.closure.fixture.inst.v1`, value: 1, unit: 'px' });
  });

  it('a type derived from the base action adds a property', () => {
    const id = 'gts.frontx.mfes.comm.action.v1~test.closure.fixture.pingx.v1~';
    plugin.registerSchema({
      $id: `gts://${id}`,
      $schema: SCHEMA,
      allOf: [{ $ref: 'gts://gts.frontx.mfes.comm.action.v1~' }],
      properties: { flavour: { type: 'string' } },
    });
    accepts({ type: id, target: DOMAIN_ID, flavour: 'a' });
  });

  it('the base types carry no closure keyword at their top level', () => {
    for (const id of [
      'gts.frontx.mfes.comm.action.v1~',
      ENTRY_TYPE,
      EXT_TYPE,
      'gts.frontx.mfes.comm.shared_property.v1~',
    ]) {
      const schema = plugin.getSchema(id) as Obj;
      expect(schema, id).toBeDefined();
      expect(schema.unevaluatedProperties, id).toBeUndefined();
      expect(schema.additionalProperties, id).toBeUndefined();
    }
  });
});

describe('inheritance of a final type', () => {
  it('the MFE entry accepts every property of the base entry', () => {
    accepts(entry({ optionalProperties: [] }));
  });

  it.each(['requiredProperties', 'actions', 'domainActions'])('the MFE entry enforces the base required %s', (field) => {
    const e = entry();
    delete e[field];
    rejects(e, /Reason: [^\n]*required property/);
  });

  it('the base MFE entry keeps its required fields for a type derived from it', () => {
    rejects({ id: BASE_ENTRY_ID, actions: [], domainActions: [] }, /Reason: [^\n]*required property/);
  });
});
