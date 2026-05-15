import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const registerDomain = vi.fn();
const updateSharedProperty = vi.fn();
const registerSchema = vi.fn();
const registerInstance = vi.fn();
const registerExtension = vi.fn().mockResolvedValue(undefined);
const getDomain = vi.fn();

const mockMfeRegistry = {
  registerDomain,
  updateSharedProperty,
  registerExtension,
  getDomain,
  typeSystem: {
    register: registerInstance,
    registerSchema,
  },
};

const mockApp = {
  mfeRegistry: mockMfeRegistry,
  themeRegistry: { getCurrent: () => undefined },
  i18nRegistry: { getLanguage: () => null },
};

vi.mock('@cyberfabric/react', async (importOriginal) => {
  const real = await importOriginal<Record<string, never>>();
  return {
    ...real,
    screenDomain: { id: 'screen-domain' },
    sidebarDomain: { id: 'sidebar-domain' },
    popupDomain: { id: 'popup-domain' },
    overlayDomain: { id: 'overlay-domain' },
  };
});

describe('bootstrapMFE (host-app)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    registerDomain.mockReset();
    updateSharedProperty.mockReset();
    registerSchema.mockReset();
    registerInstance.mockReset();
    registerExtension.mockReset();
    registerExtension.mockResolvedValue(undefined);
    getDomain.mockReset();

    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('registers the four base domains before fetching manifests', async () => {
    fetchSpy.mockResolvedValue(new Response('[]', { status: 200 }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { bootstrapMFE } = await import('./bootstrap');
    await bootstrapMFE(mockApp as never);

    expect(registerDomain).toHaveBeenCalledTimes(4);
    expect(updateSharedProperty.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('throws when the manifest fetch fails', async () => {
    fetchSpy.mockResolvedValue(new Response('not found', { status: 404, statusText: 'Not Found' }));

    const { bootstrapMFE } = await import('./bootstrap');
    await expect(bootstrapMFE(mockApp as never)).rejects.toThrow(/Failed to load MFE manifests/);
  });

  it('registers schemas, manifest, entries, and extensions for each package', async () => {
    const screenDomainId = 'screen-domain';
    getDomain.mockImplementation((id: string) => (id === screenDomainId ? { id } : undefined));

    const manifestEntity = { $id: 'manifest.demo', id: 'manifest.demo' };
    const entry = { id: 'entry.demo', actions: ['act.a'], domainActions: ['act.b'] };
    const ext = { id: 'ext.demo', domain: screenDomainId };
    const schemaActionA = { $id: 'schema.act.a' };
    const schemaActionB = { $id: 'schema.act.b' };
    const schemaUnrelated = { $id: 'schema.other' };

    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            manifest: manifestEntity,
            entries: [entry],
            extensions: [ext],
            schemas: [schemaActionA, schemaActionB, schemaUnrelated],
          },
        ]),
        { status: 200 },
      ),
    );

    const { bootstrapMFE } = await import('./bootstrap');
    await bootstrapMFE(mockApp as never);

    // Action schemas registered by scoped pass (act.a/act.b match entry actions/domainActions).
    expect(registerSchema).toHaveBeenCalledWith(schemaActionA);
    expect(registerSchema).toHaveBeenCalledWith(schemaActionB);
    // Non-action schemas are registered up-front via the first pass too.
    expect(registerSchema).toHaveBeenCalledWith(schemaUnrelated);
    expect(registerInstance).toHaveBeenCalledWith(manifestEntity);
    expect(registerInstance).toHaveBeenCalledWith(entry);
    expect(registerExtension).toHaveBeenCalledWith(ext);
  });

  it('skips extension registration when host does not own the target domain', async () => {
    getDomain.mockReturnValue(undefined);
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            manifest: { $id: 'manifest.foreign', id: 'manifest.foreign' },
            entries: [],
            extensions: [{ id: 'ext.foreign', domain: 'foreign-domain' }],
          },
        ]),
        { status: 200 },
      ),
    );

    const { bootstrapMFE } = await import('./bootstrap');
    await bootstrapMFE(mockApp as never);

    expect(registerExtension).not.toHaveBeenCalled();
  });
});
