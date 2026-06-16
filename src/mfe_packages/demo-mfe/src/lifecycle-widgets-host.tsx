/**
 * demo-mfe widgets-host lifecycle.
 *
 * Constructs a nested FrontX app that owns the widgets ExtensionDomain (per
 * Phase 1.5 audit Q5 single-owner rule). The widgets domain GTS instance is
 * authored inside `demo-mfe/mfe.json`'s `domains[]` array — content-addressed
 * by its GTS instance ID and registered into the nested type system from the
 * global runtime-fetched manifest. TypeScript transports the entity, never
 * defines it.
 *
 * Discovery follows the Phase 5.6 runtime-fetch contract: this nested app
 * fetches the same `generated-mfe-manifests.json` the host bootstrap fetches.
 * For each MFE package in the global manifest, schemas / manifest / domains /
 * entries are registered opaquely on the nested type system (Phase 6.7 order:
 * schemas → manifest → domains → entries → extensions). The widgets domain
 * instance is located in the registered domains by its GTS instance ID, then
 * the nested app takes ownership via `registry.registerDomain(domain, factory)`.
 * Extensions whose `domain` matches the widgets domain are registered opaquely
 * on the nested registry. No build-time imports of foreign-package mfe.json
 * files, no hardcoded URLs, no GTS-entity decomposition in L4 code.
 */
import React, { useEffect, useState } from 'react';
import {
  createHAI3,
  effects,
  microfrontends,
  queryCacheShared,
  mock,
  gtsPlugin,
  ConcurrentMountStrategy,
  ExtensionDomainImplementation,
  ExtensionDomainImplementationFactory,
  ActionHandler,
  HAI3_ACTION_MOUNT_EXT,
  HAI3_ACTION_UNMOUNT_EXT,
  HAI3_MFE_ENTRY_MF,
  MfeHandlerMF,
  ExtensionDomainSlot,
  ThemeAwareReactLifecycle,
  type ContainerHooks,
  type DomainContext,
  type ActionPayload,
  type MountStrategy,
  type ExtensionDomain,
  type Extension,
  type ChildMfeBridge,
  type MfManifest,
  type MfeEntryMF,
  type JSONSchema,
} from '@gears-frontx/react';

const WIDGETS_DOMAIN_ID =
  'gts.hai3.mfes.ext.domain.v1~hai3.widgets.area.main.v1';

const WIDGET_PING_ACTION_TYPE =
  'gts.hai3.mfes.comm.action.v1~hai3.widgets.test.widget_ping.v1~';

interface MfeManifestConfig {
  manifest: MfManifest;
  domains?: ExtensionDomain[];
  entries: MfeEntryMF[];
  extensions?: Extension[];
  schemas?: JSONSchema[];
}

class WidgetsContainerHooks implements ContainerHooks {
  private readonly elements = new Map<string, HTMLElement>();

  create(extensionId: string): Element {
    const el = document.createElement('div');
    el.dataset.widgetExtensionId = extensionId;
    el.style.minHeight = '4rem';
    this.elements.set(extensionId, el);
    return el;
  }

  destroy(extensionId: string): void {
    this.elements.delete(extensionId);
  }
}

class WidgetsDomainImpl extends ExtensionDomainImplementation {
  private readonly strategy: ConcurrentMountStrategy;

  constructor(ctx: DomainContext, hooks: ContainerHooks) {
    super();
    this.strategy = new ConcurrentMountStrategy(ctx.mounter, hooks);
    ctx.registerHandler(
      HAI3_ACTION_MOUNT_EXT,
      ActionHandler.fromFunction((_t, p) =>
        this.strategy.mount(p as ActionPayload),
      ),
    );
    ctx.registerHandler(
      HAI3_ACTION_UNMOUNT_EXT,
      ActionHandler.fromFunction((_t, p) =>
        this.strategy.unmount!(p as ActionPayload),
      ),
    );
  }

  protected getMountStrategies(): MountStrategy[] {
    return [this.strategy];
  }
}

class WidgetsDomainFactory extends ExtensionDomainImplementationFactory {
  build(ctx: DomainContext): WidgetsDomainImpl {
    return new WidgetsDomainImpl(ctx, new WidgetsContainerHooks());
  }
}

function createWidgetsHostApp(): ReturnType<ReturnType<typeof createHAI3>['build']> {
  return createHAI3()
    .use(effects())
        .use(microfrontends({
      typeSystem: gtsPlugin,
      mfeHandlers: [new MfeHandlerMF(HAI3_MFE_ENTRY_MF)],
    }))
    .use(queryCacheShared())
    .use(mock())
    .build();
}

/**
 * Bootstrap demo-mfe's widgets-host child runtime:
 *   1. Fetch the global manifest at runtime from the public-asset URL the
 *      generation script writes (Phase 5.6 contract).
 *   2. First pass: register every package's schemas opaquely on the child
 *      type system so derived-schema chains resolve regardless of package
 *      iteration order.
 *   3. Second pass: for each package, register manifest, domains, then
 *      entries opaquely on the child type system (Phase 6.7 order:
 *      schemas → manifest → domains → entries → extensions). While iterating
 *      domains, locate the widgets domain by its GTS instance ID so the
 *      nested app can take ownership of it via `registry.registerDomain(...)`.
 *   4. Take ownership of the widgets domain (registerDomain on the nested
 *      registry, paired with the local `WidgetsDomainFactory`).
 *   5. Third pass: for each extension whose target domain is the widgets
 *      domain, register it opaquely on the child registry.
 *
 * GTS entities flow through unchanged — no spread, no override, no
 * decomposition, no L4 reconstruction. The generation script inlines the
 * resolved `MfManifest` object into each entry's `manifest` field so entries
 * are registered opaquely without any consumer-side spread. The widgets
 * domain instance is authored once in `demo-mfe/mfe.json` (`domains[]`) and
 * arrives here through the same fetched manifest pipeline as every other GTS
 * entity.
 */
async function bootstrapWidgetsRuntime(
  app: ReturnType<typeof createWidgetsHostApp>,
): Promise<void> {
  const registry = app.mfeRegistry;
  if (!registry) {
    throw new Error(
      'demo-mfe widgets-host: app.mfeRegistry is undefined.',
    );
  }

  console.info(
    '[demo-mfe widgets-host] Fetching MFE manifests from /generated-mfe-manifests.json',
  );
  const response = await fetch('/generated-mfe-manifests.json');
  if (!response.ok) {
    throw new Error(
      `[demo-mfe widgets-host] Failed to load MFE manifests from /generated-mfe-manifests.json: ${response.status} ${response.statusText}`,
    );
  }
  const manifests = (await response.json()) as MfeManifestConfig[];

  for (const config of manifests) {
    for (const schema of config.schemas ?? []) {
      registry.typeSystem.registerSchema(schema);
    }
  }

  let widgetsDomain: ExtensionDomain | undefined;
  for (const config of manifests) {
    registry.typeSystem.register(config.manifest);
    for (const domain of config.domains ?? []) {
      registry.typeSystem.register(domain);
      if (domain.id === WIDGETS_DOMAIN_ID) {
        widgetsDomain = domain;
      }
    }
    for (const entry of config.entries) {
      registry.typeSystem.register(entry);
    }
  }

  if (!widgetsDomain) {
    throw new Error(
      `[demo-mfe widgets-host] Widgets domain ${WIDGETS_DOMAIN_ID} not found in any registered MFE manifest's domains[].`,
    );
  }
  registry.registerDomain(widgetsDomain, new WidgetsDomainFactory());

  for (const config of manifests) {
    for (const extension of config.extensions ?? []) {
      if (extension.domain === WIDGETS_DOMAIN_ID) {
        await registry.registerExtension(extension);
      }
    }
  }
}

function WidgetsHostScreen(): React.ReactElement {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appRef] = useState(() => createWidgetsHostApp());
  const registry = appRef.mfeRegistry;

  useEffect(() => {
    let cancelled = false;
    bootstrapWidgetsRuntime(appRef)
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[demo-mfe widgets-host] runtime bootstrap failed:', err);
        if (!cancelled) setError(msg);
      });
    return () => {
      cancelled = true;
    };
  }, [appRef]);

  const handleAttached = (): void => {
    if (!registry) return;
    const extensions = registry.getExtensionsForDomain(WIDGETS_DOMAIN_ID);
    for (const ext of extensions) {
      registry
        .executeActionsChain({
          action: {
            type: HAI3_ACTION_MOUNT_EXT,
            target: WIDGETS_DOMAIN_ID,
            payload: { subject: ext.id },
          },
        })
        .catch((err) => {
          console.error(
            `[demo-mfe widgets-host] mount_ext for ${ext.id} failed:`,
            err,
          );
        });
    }
  };

  if (error) {
    return (
      <div
        className="p-4 text-red-700"
        data-demo-mfe-widgets-host="error"
      >
        Widgets host runtime failed: {error}
      </div>
    );
  }

  if (!ready || !registry) {
    return (
      <div className="p-4" data-demo-mfe-widgets-host="loading">
        Loading widgets host runtime…
      </div>
    );
  }

  const pingTargets = registry
    .getExtensionsForDomain(WIDGETS_DOMAIN_ID)
    .filter((ext) => {
      const entry = registry.typeSystem.getSchema(ext.entry) as
        | { actions?: readonly string[] }
        | undefined;
      return entry?.actions?.includes(WIDGET_PING_ACTION_TYPE) ?? false;
    });

  const handlePing = (extensionId: string): void => {
    registry
      .executeActionsChain({
        action: {
          type: WIDGET_PING_ACTION_TYPE,
          target: extensionId,
          payload: {},
        },
      })
      .catch((err) => {
        console.error(
          `[demo-mfe widgets-host] ping ${extensionId} failed:`,
          err,
        );
      });
  };

  return (
    <div
      data-demo-mfe-widgets-host="true"
      className="flex h-full flex-col gap-2 p-4"
    >
      <header>
        <h2 className="text-xl font-semibold">Widgets Host</h2>
        <p className="text-sm opacity-75">
          Multi-mount fixture: widgets-fixture-a's entry is wired here as
          two distinct extension instances (alpha and beta) sharing the same
          entry path; widgets-fixture-b's entry is wired as a third
          instance. All three render concurrently in the widgets domain
          slot below.
        </p>
      </header>
      <div className="flex flex-wrap gap-2">
        {pingTargets.map((ext) => {
          const role = ext.id.includes('widget_alpha') ? 'alpha' : 'beta';
          return (
            <button
              key={ext.id}
              type="button"
              data-testid={`ping-${role}`}
              data-target-extension-id={ext.id}
              onClick={() => handlePing(ext.id)}
              className="rounded border border-blue-400 bg-blue-100 px-3 py-1 text-sm text-blue-900 hover:bg-blue-200"
            >
              Ping {role}
            </button>
          );
        })}
      </div>
      <ExtensionDomainSlot
        registry={registry}
        domainId={WIDGETS_DOMAIN_ID}
        className="demo-mfe-widgets-host-slot"
        onAttached={handleAttached}
      />
    </div>
  );
}

class DemoMfeWidgetsHostLifecycle extends ThemeAwareReactLifecycle {
  constructor() {
    super(createWidgetsHostApp());
  }

  protected renderContent(_bridge: ChildMfeBridge): React.ReactNode {
    return <WidgetsHostScreen />;
  }
}

export default new DemoMfeWidgetsHostLifecycle();
