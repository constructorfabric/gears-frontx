// @cpt-flow:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2

/**
 * MFE Bootstrap
 *
 * Registers MFE domains, extensions, and handlers with the FrontX app.
 *
 * MFE manifest configs are fetched at runtime from `/generated-mfe-manifests.json`
 * (a public asset produced by `scripts/generate-mfe-manifests.ts` before each
 * `vite dev` / `vite build`). The script accepts `--base-url` for
 * deployment-specific `publicPath` values; the JSON shape is identical to
 * what the future backend API will return so the transport swap is a
 * one-line URL change here.
 */

import {
  ExtensionDomainImplementation,
  ExtensionDomainImplementationFactory,
  ExclusiveMountStrategy,
  OptionalMountStrategy,
  ActionHandler,
  HAI3_ACTION_MOUNT_EXT,
  HAI3_ACTION_UNMOUNT_EXT,
  HAI3_SHARED_PROPERTY_THEME,
  HAI3_SHARED_PROPERTY_LANGUAGE,
  screenDomain,
  sidebarDomain,
  popupDomain,
  overlayDomain,
} from '@gears-frontx/react';
import type {
  HAI3App,
  Extension,
  ExtensionDomain,
  MfManifest,
  MfeEntryMF,
  JSONSchema,
  MfeRegistry,
  ContainerHooks,
  DomainContext,
  ActionPayload,
  MountStrategy,
} from '@gears-frontx/react';

const MFE_MANIFESTS_URL = '/generated-mfe-manifests.json';

/**
 * Shape of each MFE manifest config in the generated JSON.
 * Matches the output of scripts/generate-mfe-manifests.ts. `extensions` is
 * optional because an MFE may declare only loadable entries (with no
 * default wiring); the consumer chooses how those entries get wired into
 * domains. Self-declared `extensions[]` are still supported for MFEs that
 * propose default wirings the host should pick up. `domains` is optional
 * because most MFEs target host-owned domains; an MFE declares `domains`
 * only when it owns an ExtensionDomain instance (e.g., demo-mfe owns the
 * widgets domain — registered here so extensions targeting that domain
 * resolve content-addressed at the runtime store).
 */
interface MfeManifestConfig {
  manifest: MfManifest;
  domains?: ExtensionDomain[];
  entries: MfeEntryMF[];
  extensions?: Extension[];
  schemas?: JSONSchema[];
}

// ─── Domain implementation building blocks ───────────────────────────────────
//
// The redesigned domain model owns mount semantics inside the domain
// implementation. Each domain registered with the registry pairs an
// `ExtensionDomain` declaration with an `ExtensionDomainImplementationFactory`
// whose `build(ctx)` constructs an `ExtensionDomainImplementation`. The
// implementation captures the per-domain mounter and a `ContainerHooks`
// inside its chosen `MountStrategy` and registers per-action-type handlers
// that delegate to the strategy.

class HostContainerHooks implements ContainerHooks {
  private readonly elements = new Map<string, HTMLElement>();

  create(extensionId: string): Element {
    const el = document.createElement('div');
    el.dataset.extensionId = extensionId;
    el.style.height = '100%';
    this.elements.set(extensionId, el);
    return el;
  }

  destroy(extensionId: string): void {
    this.elements.delete(extensionId);
  }
}

class ScreenDomainImpl extends ExtensionDomainImplementation {
  private readonly strategy: ExclusiveMountStrategy;

  constructor(ctx: DomainContext, hooks: ContainerHooks, registry: MfeRegistry, domainId: string) {
    super();
    this.strategy = new ExclusiveMountStrategy(ctx.mounter, hooks, registry, domainId);
    ctx.registerHandler(
      HAI3_ACTION_MOUNT_EXT,
      ActionHandler.fromFunction((_t, p) => this.strategy.mount(p as ActionPayload)),
    );
  }

  protected getMountStrategies(): MountStrategy[] {
    return [this.strategy];
  }
}

class OptionalDomainImpl extends ExtensionDomainImplementation {
  private readonly strategy: OptionalMountStrategy;

  constructor(ctx: DomainContext, hooks: ContainerHooks, registry: MfeRegistry, domainId: string) {
    super();
    this.strategy = new OptionalMountStrategy(ctx.mounter, hooks, registry, domainId);
    ctx.registerHandler(
      HAI3_ACTION_MOUNT_EXT,
      ActionHandler.fromFunction((_t, p) => this.strategy.mount(p as ActionPayload)),
    );
    ctx.registerHandler(
      HAI3_ACTION_UNMOUNT_EXT,
      ActionHandler.fromFunction((_t, p) => this.strategy.unmount!(p as ActionPayload)),
    );
  }

  protected getMountStrategies(): MountStrategy[] {
    return [this.strategy];
  }
}

class ScreenDomainFactory extends ExtensionDomainImplementationFactory {
  constructor(private readonly registry: MfeRegistry) { super(); }
  build(ctx: DomainContext): ScreenDomainImpl {
    return new ScreenDomainImpl(ctx, new HostContainerHooks(), this.registry, screenDomain.id);
  }
}

class OptionalDomainFactory extends ExtensionDomainImplementationFactory {
  constructor(
    private readonly registry: MfeRegistry,
    private readonly domainId: string,
  ) { super(); }
  build(ctx: DomainContext): OptionalDomainImpl {
    return new OptionalDomainImpl(ctx, new HostContainerHooks(), this.registry, this.domainId);
  }
}

// @cpt-begin:cpt-frontx-dod-mfe-registry-mfe-schema-registration:p1:inst-1
/**
 * Scoped schema registration: only register schemas whose $id matches an action ID
 * declared by at least one entry in this package. Action schemas are validated
 * against declared entry actions; non-action schemas (derived ExtensionDomain
 * and Extension type schemas owned by parent MFEs) are registered separately
 * via `registerNonActionSchemas` because they have no action ID counterpart.
 */
function collectDeclaredActionIds(entries: MfeEntryMF[]): Set<string> {
  const declaredActionIds = new Set<string>();
  for (const entry of entries) {
    for (const actionId of entry.actions) declaredActionIds.add(actionId);
    for (const actionId of entry.domainActions) declaredActionIds.add(actionId);
  }
  return declaredActionIds;
}

function registerScopedSchemas(
  registry: MfeRegistry,
  schemas: JSONSchema[],
  declaredActionIds: Set<string>,
): void {
  for (const schema of schemas) {
    const schemaId = schema.$id;
    if (!schemaId) continue;
    const matches = Array.from(declaredActionIds).some((actionId) =>
      schemaId.includes(actionId),
    );
    if (matches) {
      registry.typeSystem.registerSchema(schema);
    }
  }
}

/**
 * Register schemas that are not action schemas. Derived `ExtensionDomain` and
 * `Extension` type schemas declared by a parent MFE (e.g., demo-mfe's widgets
 * domain derived schema) must be registered before any leaf MFE's extension
 * instance is validated against the chain — per
 * `cpt-frontx-dod-mfe-registry-mfe-schema-registration` (parent
 * registers schemas before entries / extensions). The action-id-match filter
 * in `registerScopedSchemas` does not apply to these schemas because their
 * `$id` is a domain or extension type ID, not an action ID.
 *
 * Registration is idempotent: `gtsPlugin.registerSchema` accepts duplicates,
 * so registering all non-action schemas across all packages in a first pass
 * is safe and keeps the schema chain available before any leaf-MFE extension
 * registration.
 */
function registerNonActionSchemas(
  registry: MfeRegistry,
  schemas: JSONSchema[],
  declaredActionIds: Set<string>,
): void {
  for (const schema of schemas) {
    const schemaId = schema.$id;
    if (!schemaId) continue;
    const matchesAction = Array.from(declaredActionIds).some((actionId) =>
      schemaId.includes(actionId),
    );
    if (!matchesAction) {
      registry.typeSystem.registerSchema(schema);
    }
  }
}
// @cpt-end:cpt-frontx-dod-mfe-registry-mfe-schema-registration:p1:inst-1

/**
 * First pass over every package: register all non-action schemas on the gts
 * singleton so leaf-MFE extension validation later in the second pass can chain
 * through derived schemas declared by parent MFEs (regardless of iteration
 * order in `generated-mfe-manifests.json`).
 */
function registerAllNonActionSchemas(
  registry: MfeRegistry,
  manifests: readonly MfeManifestConfig[],
): void {
  for (const config of manifests) {
    if (!config.schemas) continue;
    registerNonActionSchemas(
      registry,
      config.schemas,
      collectDeclaredActionIds(config.entries),
    );
  }
}

/**
 * Returns true when the given domain ID is registered on the host registry —
 * i.e., this host owns the domain and is responsible for registering its
 * extensions. Foreign-domain extensions (those whose target domain is owned by
 * a different runtime, like the widgets domain owned by demo-mfe's child
 * FrontX app) MUST NOT be registered on the host registry; they reach their
 * owning runtime through a content-addressed dispatcher (per Phase 2.6 —
 * `cpt-frontx-algo-framework-composition-content-addressed-discovery`).
 */
function hostOwnsDomain(registry: MfeRegistry, domainId: string): boolean {
  return registry.getDomain(domainId) !== undefined;
}

async function registerMfePackage(
  registry: MfeRegistry,
  config: MfeManifestConfig,
): Promise<void> {
  if (config.schemas) {
    registerScopedSchemas(registry, config.schemas, collectDeclaredActionIds(config.entries));
  }
  // register() validates each instance against its schema and throws on
  // failure — invalid manifests/entries fail startup loudly rather than
  // persisting broken state into the registry. The aggregator script inlines
  // the resolved MfManifest object into each entry's `manifest` field so the
  // host registers entries opaquely — no spread/override needed here.
  registry.typeSystem.register(config.manifest);
  // Registration order: schemas → manifest → domains → entries → extensions.
  // Domains MUST be registered before any extension references them so the
  // content-addressed dispatcher can resolve target-domain ownership at the
  // GTS runtime store. Domain registration is opaque — the aggregator passes
  // each `ExtensionDomain` instance through verbatim.
  for (const domain of config.domains ?? []) {
    console.info(`[MFE Bootstrap] Registering domain ${domain.id}`);
    registry.typeSystem.register(domain);
  }
  for (const entry of config.entries) {
    registry.typeSystem.register(entry);
  }
  for (const extension of config.extensions ?? []) {
    // Phase 2.6 content-addressed discovery: only register extensions whose
    // target domain is owned by this host registry. Extensions targeting a
    // domain owned by another FrontX app (e.g., widgets-fixture-a's two widget
    // extensions target the widgets domain owned by demo-mfe's child app) are
    // skipped here and dispatched to the owning runtime by L4 inline code in
    // that runtime's bootstrap. When the framework `microfrontends()` plugin's
    // content-addressed dispatcher lands (post-Phase 2.6 implementation), this
    // skip-and-defer rule moves into L2 and the host bootstrap becomes a pure
    // GTS-runtime-store registrar.
    if (!hostOwnsDomain(registry, extension.domain)) {
      continue;
    }
    await registry.registerExtension(extension);
  }
}

/**
 * Bootstrap MFE system for the host application.
 *
 * Synchronously registers the four well-known domains (screen, sidebar,
 * popup, overlay) with their per-domain implementation factories, then
 * broadcasts initial shared properties (theme, language) and asynchronously
 * registers extensions declared in `generated-mfe-manifests.json`.
 *
 * Mount/unmount lifecycle is delegated to ExtensionDomainSlot in
 * MfeScreenContainer (and any other host-rendered slots).
 *
 * @param app - FrontX application instance
 */
// @cpt-begin:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-bootstrap-mfe
export async function bootstrapMFE(app: HAI3App): Promise<void> {
  const registry = app.mfeRegistry;
  if (!registry) {
    throw new Error('[MFE Bootstrap] mfeRegistry is not available on app instance');
  }

  registry.registerDomain(screenDomain, new ScreenDomainFactory(registry));
  registry.registerDomain(sidebarDomain, new OptionalDomainFactory(registry, sidebarDomain.id));
  registry.registerDomain(popupDomain, new OptionalDomainFactory(registry, popupDomain.id));
  registry.registerDomain(overlayDomain, new OptionalDomainFactory(registry, overlayDomain.id));

  const currentThemeId = app.themeRegistry?.getCurrent()?.id ?? 'default';
  registry.updateSharedProperty(HAI3_SHARED_PROPERTY_THEME, currentThemeId);
  const derivedLanguage = app.i18nRegistry.getLanguage();
  registry.updateSharedProperty(HAI3_SHARED_PROPERTY_LANGUAGE, derivedLanguage ?? 'en');

  console.info(`[MFE Bootstrap] Fetching MFE manifests from ${MFE_MANIFESTS_URL}`);
  const response = await fetch(MFE_MANIFESTS_URL);
  if (!response.ok) {
    throw new Error(
      `[MFE Bootstrap] Failed to load MFE manifests from ${MFE_MANIFESTS_URL}: ${response.status} ${response.statusText}`,
    );
  }
  const manifests = (await response.json()) as MfeManifestConfig[];

  if (manifests.length === 0) {
    console.warn(
      '[MFE Bootstrap] No MFE manifests found. Run `npm run generate:mfe-manifests` to generate them.',
    );
    return;
  }
  // First pass: register every package's non-action schemas (derived
  // ExtensionDomain / Extension type schemas) so leaf-MFE extension validation
  // in the second pass can chain through them regardless of manifest order.
  registerAllNonActionSchemas(registry, manifests);
  for (const config of manifests) {
    await registerMfePackage(registry, config);
  }
}
// @cpt-end:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-bootstrap-mfe
