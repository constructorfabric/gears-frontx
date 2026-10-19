// @cpt-algo:cpt-frontx-algo-mfe-host-communication-host-theme:p2
// @cpt-algo:cpt-frontx-algo-mfe-host-communication-mount-context:p2
// @cpt-dod:cpt-frontx-dod-mfe-host-communication-host-theme:p1
// @cpt-dod:cpt-frontx-dod-mfe-host-communication-mount-context:p1
import { describe, expect, it } from 'vitest';
import { createMfeRegistryFactory } from '../DefaultMfeRegistryFactory';
import type { MfeRegistry } from '../../registry/MfeRegistry';
import type { MfeRegistryConfig } from '../config';
import type { TypeSystemPlugin } from '../../type-substrate';
import type { Extension, ExtensionDomain, MfeEntry } from '../../types';
import { MfeHandler, type MfeEntryLifecycle, type MfeMountContext } from '../../handler/MfeHandler';
import type { ChildMfeBridge } from '../../handler/ChildMfeBridge';
import { MfeBridgeFactoryDefault } from '../../bridge/MfeBridgeFactoryDefault';
import { ExtensionDomainImplementation } from '../ExtensionDomainImplementation';
import { ExtensionDomainImplementationFactory } from '../ExtensionDomainImplementationFactory';
import type { DomainContext } from '../DomainContext';
import { ConcurrentMountStrategy } from '../ConcurrentMountStrategy';
import type { ContainerHooks, MountStrategy } from '../MountStrategy';
import { ActionHandler } from '../../mediator/ActionHandler';

const LOAD = 'mock.action~load_ext';
const MOUNT = 'mock.action~mount_ext';
const UNMOUNT = 'mock.action~unmount_ext';
const PROBE = 'mock.action~mount_done';
const DOMAIN = 'mock.domain~widgets';
const EXTENSION = 'mock.extension~widget';
const ENTRY_BASE = 'mock.entry~';
const ENTRY = `${ENTRY_BASE}widget`;

interface MockSchema { $id?: string }

function createPlugin(): TypeSystemPlugin<MockSchema> {
  const schemas = new Map<string, MockSchema>();
  return {
    name: 'ThemeTestPlugin',
    version: '1.0.0',
    registerSchema(schema) { if (schema.$id) schemas.set(schema.$id, schema); },
    getSchema(id) { return schemas.get(id); },
    register() {},
    isTypeOf(id, base) { return id === base || id.startsWith(base); },
    validateInstance() { return { valid: true, errors: [] }; },
    resolveLoadExtActionId: () => LOAD,
    resolveMountExtActionId: () => MOUNT,
    resolveUnmountExtActionId: () => UNMOUNT,
    resolveLifecycleStageInitId: () => 'mock.stage~init',
    resolveLifecycleStageActivatedId: () => 'mock.stage~activated',
    resolveLifecycleStageDeactivatedId: () => 'mock.stage~deactivated',
    resolveLifecycleStageDestroyedId: () => 'mock.stage~destroyed',
  };
}

class RecordingHandler extends MfeHandler {
  readonly bridgeFactory = new MfeBridgeFactoryDefault();
  root: ShadowRoot | undefined;
  context: MfeMountContext | undefined;

  constructor(private readonly observeMount?: (root: ShadowRoot, context: MfeMountContext | undefined) => void) {
    super(ENTRY_BASE);
  }

  async load(): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return {
      mount: (container, _bridge, context) => {
        if (!(container instanceof ShadowRoot)) throw new Error('Expected shadow root');
        this.root = container;
        this.context = context;
        this.observeMount?.(container, context);
      },
      unmount: () => {},
    };
  }
}

// An attribute the domain's own container hook writes on the host before the
// runtime sees it; set by the one test that checks the runtime leaves it alone.
let hostPresetAttribute: { name: string; value: string } | undefined;

class Hooks implements ContainerHooks {
  create(): Element {
    const element = document.createElement('div');
    if (hostPresetAttribute) element.setAttribute(hostPresetAttribute.name, hostPresetAttribute.value);
    return element;
  }
  destroy(): void {}
}

class DomainImplementation extends ExtensionDomainImplementation {
  private readonly strategy: ConcurrentMountStrategy;

  constructor(ctx: DomainContext, notifyMount: () => void) {
    super();
    this.strategy = new ConcurrentMountStrategy(ctx.mounter, new Hooks());
    ctx.registerHandler(MOUNT, ActionHandler.fromFunction((_type, payload) => this.strategy.mount(payload as { subject: string })));
    ctx.registerHandler(UNMOUNT, ActionHandler.fromFunction((_type, payload) => this.strategy.unmount!(payload as { subject: string })));
    ctx.registerHandler(PROBE, ActionHandler.fromFunction(async () => { notifyMount(); }));
  }

  protected getMountStrategies(): MountStrategy[] { return [this.strategy]; }
}

class DomainFactory extends ExtensionDomainImplementationFactory {
  constructor(private readonly notifyMount: () => void) { super(); }
  build(ctx: DomainContext): ExtensionDomainImplementation {
    return new DomainImplementation(ctx, this.notifyMount);
  }
}

async function mountExtension(
  config: Pick<MfeRegistryConfig, 'themeAppearanceAttribute' | 'hostBaseUrl'> = {},
  beforeMount?: (registry: MfeRegistry) => void,
  observeMount?: (root: ShadowRoot, context: MfeMountContext | undefined) => void
): Promise<{ registry: MfeRegistry; handler: RecordingHandler; root: ShadowRoot }> {
  const plugin = createPlugin();
  const entry: MfeEntry & MockSchema = { $id: ENTRY, id: ENTRY, requiredProperties: [], actions: [], domainActions: [] };
  plugin.registerSchema(entry);
  const handler = new RecordingHandler(observeMount);
  const registry = createMfeRegistryFactory().build({ typeSystem: plugin, mfeHandlers: [handler], ...config });
  let notifyMount!: () => void;
  const mounted = new Promise<void>((resolve) => { notifyMount = resolve; });
  const domain: ExtensionDomain = {
    id: DOMAIN,
    sharedProperties: [],
    actions: [LOAD, MOUNT, UNMOUNT, PROBE],
    extensionsActions: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
  };
  const extension: Extension = { id: EXTENSION, domain: DOMAIN, entry: ENTRY };
  registry.registerDomain(domain, new DomainFactory(notifyMount));
  await registry.registerExtension(extension);
  beforeMount?.(registry);
  registry.getMounter(DOMAIN).attach(document.createElement('div'));
  registry.executeActionsChain({
    action: { type: MOUNT, target: DOMAIN, payload: { subject: EXTENSION } },
    next: { action: { type: PROBE, target: DOMAIN, payload: {} } },
  });
  await mounted;
  if (!handler.root) throw new Error('Mount did not receive a shadow root');
  return { registry, handler, root: handler.root };
}

describe('host theme and mount context', () => {
  it('applies a theme before lifecycle mount when set before mounting', async () => {
    const observed: Array<{ appearance: string | null; css: string | null }> = [];
    const { registry } = await mountExtension(
      { themeAppearanceAttribute: 'data-appearance' },
      (runtime) => runtime.setTheme({ '--accent': 'blue' }, 'dark'),
      (root) => observed.push({
        appearance: root.host.getAttribute('data-appearance'),
        css: root.getElementById('__frontx-css-variables__')?.textContent ?? null,
      })
    );

    expect(observed).toEqual([{
      appearance: 'dark',
      css: ":host([data-appearance='dark']), [data-appearance='dark'][data-appearance='dark'] {\n  --accent: blue;\n}",
    }]);
    await registry.dispose();
  });

  it('updates mounted roots, copies input variables, and removes stale variables and appearance', async () => {
    const { registry, root } = await mountExtension({ themeAppearanceAttribute: 'data-appearance' });
    const vars = { '--accent': 'blue' };

    registry.setTheme(vars, 'dark');
    vars['--accent'] = 'red';
    expect(root.getElementById('__frontx-css-variables__')?.textContent).toContain('--accent: blue;');
    registry.setTheme({ '--accent': 'green' });
    expect(root.host.hasAttribute('data-appearance')).toBe(false);
    expect(root.querySelectorAll('#__frontx-css-variables__')).toHaveLength(1);
    expect(root.getElementById('__frontx-css-variables__')?.textContent).toBe(':host {\n  --accent: green;\n}');
    registry.setTheme({});
    expect(root.getElementById('__frontx-css-variables__')).toBeNull();
    await registry.dispose();
  });

  it('uses the unscoped host selector when no appearance attribute is configured', async () => {
    const { registry, root } = await mountExtension({}, (runtime) => runtime.setTheme({ '--accent': 'blue' }, 'dark'));

    expect(root.host.attributes).toHaveLength(0);
    expect(root.getElementById('__frontx-css-variables__')?.textContent).toBe(':host {\n  --accent: blue;\n}');
    await registry.dispose();
  });

  it('leaves the shadow root and the host attribute alone when setTheme is never called', async () => {
    hostPresetAttribute = { name: 'data-appearance', value: 'light' };
    try {
      const { registry, root } = await mountExtension({ themeAppearanceAttribute: 'data-appearance' });

      expect(root.host.getAttribute('data-appearance')).toBe('light');
      expect(root.getElementById('__frontx-css-variables__')).toBeNull();
      await registry.dispose();
    } finally {
      hostPresetAttribute = undefined;
    }
  });

  it('applies the variables as they were at the setTheme call to a later mount', async () => {
    const vars = { '--accent': 'blue' };
    const observed: Array<string | null> = [];

    const { registry } = await mountExtension(
      {},
      (runtime) => {
        runtime.setTheme(vars);
        vars['--accent'] = 'red';
      },
      (root) => observed.push(root.getElementById('__frontx-css-variables__')?.textContent ?? null)
    );

    expect(observed).toEqual([':host {\n  --accent: blue;\n}']);
    await registry.dispose();
  });

  it('refuses an appearance outside light and dark and leaves the mounted root as it was', async () => {
    const { registry, root } = await mountExtension(
      { themeAppearanceAttribute: 'data-appearance' },
      (runtime) => runtime.setTheme({ '--accent': 'blue' }, 'dark')
    );
    const before = root.getElementById('__frontx-css-variables__')?.textContent;

    expect(() => registry.setTheme({ '--accent': 'red' }, "x'] , * { color: red } [a='" as 'dark')).toThrow(/Invalid theme appearance/);

    expect(root.host.getAttribute('data-appearance')).toBe('dark');
    expect(root.getElementById('__frontx-css-variables__')?.textContent).toBe(before);
    await registry.dispose();
  });

    it('passes the configured host base unchanged through the mount context', async () => {
    const { registry, handler } = await mountExtension({ hostBaseUrl: 'https://host.example/app/' });

    expect(handler.context).toEqual({ extensionId: EXTENSION, domainId: DOMAIN, hostBaseUrl: 'https://host.example/app/' });
    await registry.dispose();
  });

  it('omits the host base key when no base is configured', async () => {
    const { registry, handler } = await mountExtension();

    expect(handler.context).toStrictEqual({ extensionId: EXTENSION, domainId: DOMAIN });
    await registry.dispose();
  });
});
