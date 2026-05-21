# FrontX Core Surface


<!-- toc -->

- [Purpose](#purpose)
- [The three-pillar vision (foundational)](#the-three-pillar-vision-foundational)
  - [Pillar 1 — Core framework (technical skeleton)](#pillar-1--core-framework-technical-skeleton)
  - [Pillar 2 — CLI (project lifecycle orchestrator)](#pillar-2--cli-project-lifecycle-orchestrator)
  - [Pillar 3 — AI tooling (template-extendable AI framework)](#pillar-3--ai-tooling-template-extendable-ai-framework)
  - [Pillar parity requirement](#pillar-parity-requirement)
- [Important note — PRD vs DESIGN distinction](#important-note--prd-vs-design-distinction)
- [Ecosystem inventory](#ecosystem-inventory)
- [Mechanical boundary rules](#mechanical-boundary-rules)
  - [Rule MFES-1 — No GTS string literals in `@cyberfabric/mfes`](#rule-mfes-1--no-gts-string-literals-in-cyberfabricmfes)
  - [Rule MFES-2 — No solution-specific shared-property identifiers in `@cyberfabric/mfes`](#rule-mfes-2--no-solution-specific-shared-property-identifiers-in-cyberfabricmfes)
  - [Rule MFES-3 — No specific layout domain values in `@cyberfabric/mfes`](#rule-mfes-3--no-specific-layout-domain-values-in-cyberfabricmfes)
  - [Rule MFES-4 — No type-system format dependencies in `@cyberfabric/mfes`](#rule-mfes-4--no-type-system-format-dependencies-in-cyberfabricmfes)
  - [Rule MFES-5 — Type-system format types live with the plugin](#rule-mfes-5--type-system-format-types-live-with-the-plugin)
  - [Rule GTS-PLUGIN-1 — `@cyberfabric/gts-plugin` owns all infrastructure GTS schemas](#rule-gts-plugin-1--cyberfabricgts-plugin-owns-all-infrastructure-gts-schemas)
  - [Rule GTS-PLUGIN-2 — `@cyberfabric/gts-plugin` does NOT own solution-specific GTS schemas](#rule-gts-plugin-2--cyberfabricgts-plugin-does-not-own-solution-specific-gts-schemas)
  - [Rule API-1 — No solution-specific content in `@cyberfabric/api`](#rule-api-1--no-solution-specific-content-in-cyberfabricapi)
  - [Rule CLI-1 — `@cyberfabric/cli` has zero dependency on any template](#rule-cli-1--cyberfabriccli-has-zero-dependency-on-any-template)
  - [Rule KIT-1 — `cyber-pilot-kit-frontx` resource IDs all prefixed `frontx_`](#rule-kit-1--cyber-pilot-kit-frontx-resource-ids-all-prefixed-frontx)
- [Package surfaces](#package-surfaces)
  - [`@cyberfabric/mfes`](#cyberfabricmfes)
  - [`@cyberfabric/gts-plugin`](#cyberfabricgts-plugin)
  - [`@cyberfabric/api`](#cyberfabricapi)
  - [`@cyberfabric/cli`](#cyberfabriccli)
  - [`cyber-pilot-kit-frontx`](#cyber-pilot-kit-frontx)
- [Out-of-ecosystem inventory](#out-of-ecosystem-inventory)
  - [From current `packages/screensets`](#from-current-packagesscreensets)
  - [From current `packages/api`](#from-current-packagesapi)
  - [From current `packages/*` (whole packages)](#from-current-packages-whole-packages)
  - [Solution GTS schemas owned by `frontx-template-standard`](#solution-gts-schemas-owned-by-frontx-template-standard)
- [Logical-to-concrete component mapping (vision context)](#logical-to-concrete-component-mapping-vision-context)
- [Open items deferred to later phases](#open-items-deferred-to-later-phases)

<!-- /toc -->

## Purpose

Overseer-compact vision document for the FrontX ecosystem redesign. Designed to survive session compacting: any future overseer or planner session that picks up this work reads this file to recover the locked vision, scope of works, and important context. This is NOT a document that defines how to generate the PRD — kickoff files do that. CORE_SURFACE.md is vision + scope + context only.

## The three-pillar vision (foundational)

The FrontX ecosystem is structured as THREE PILLARS. The pillars are CO-EQUAL at the PRD level: §1 narrative, §4 scope, and §5 FR distribution give each pillar comparable depth.

### Pillar 1 — Core framework (technical skeleton)

The technical foundation that makes an application runtime-extensible by composable microfrontends, with cross-cutting client-server communication contracts and a substrate for typed entities. The foundation is **performant**, **UI-framework-agnostic** (applications choose their own UI library — React, Vue, Svelte, vanilla — and FrontX core makes no such choice), **evolvable** (semver-disciplined releases; breaking changes in the product are isolated from consuming applications by versioning and compatibility commitments), and **scales without architectural ceiling** (the platform places no upper limit on application complexity — number of microfrontends, type definitions, or communication patterns).

Logical components (concrete artifacts in parentheses):
  - MFE Runtime (`@cyberfabric/mfes`) — loads microfrontends, manages their state in the application, mediates host↔microfrontend communication, validates registered entities against type definitions
  - Type System (`@cyberfabric/gts-plugin`) — provides the type definitions the MFE Runtime requires; supports registration of additional type definitions
  - API Protocol Surface (`@cyberfabric/api`) — provides client-server communication interfaces (request-response and event streaming) with cross-cutting extension points

### Pillar 2 — CLI (project lifecycle orchestrator)

A template-agnostic command-line tool that owns the project lifecycle — install/list/update/validate templates, scaffold projects and microfrontends from installed templates, resolve composed templates, record project provenance, upgrade existing projects to newer template versions. The CLI organizes its commands into TWO NAMESPACES — one for project-level operations and one for microfrontend-level operations — reflecting the two first-class template kinds the product supports.

Logical component:
  - CLI (`@cyberfabric/cli`) — the project lifecycle commands above. Has ZERO hardcoded template names.

### Pillar 3 — AI tooling (template-extendable AI framework)

A FRAMEWORK for AI-assisted FrontX work, on par structurally with the MFE Runtime pillar — base ecosystem AI capabilities + extension points where templates plug in their own AI capabilities + a discovery mechanism that activates installed-template AI extensions in projects.

Key vision points (verbatim from overseer's original framing):
  - "template-agnostic, same as cli" — the FrontX AI tooling framework itself has zero template-specific content
  - "templates can contain ai skills and guidelines related to the template" — templates ARE first-class extension contributors
  - "the frontx cypilot kit should be able to discover these template-specific skills and guidelines" — the AI tooling pillar provides the discovery mechanism, not the templates
  - "updating projects to a newer version of the same template can be done via ai tooling, not necessarily just cli" — the AI tooling pillar orchestrates upgrades, not just the CLI; it is an active capability surface

Logical component:
  - AI Tooling Framework (`cyber-pilot-kit-frontx`) — base ecosystem AI capabilities (SDLC workflows, ecosystem-wide skills, guidelines for FrontX-specific work), an extension contract templates conform to when they bundle AI capabilities, a discovery + composition mechanism that surfaces installed-template AI extensions to AI agents working in a project, and AI-driven project-upgrade orchestration that operates alongside (not subordinate to) the CLI.

### Pillar parity requirement

The three pillars are CO-EQUAL at the PRD level. PRD §1 narrative, §4 scope enumeration, and §5 FR distribution MUST give each pillar comparable depth. If any pillar produces fewer than ~5 capabilities or fewer than ~5 FRs while another produces twice that, the planner / overseer MUST review for under-representation. Each pillar's capability set is anchored in this section.

## Important note — PRD vs DESIGN distinction

The PRD describes **what the product enables for its users** — capabilities at the user-need level. The DESIGN describes **how the product is structured to deliver those capabilities** — mechanisms, patterns, interfaces.

The following concepts that appear elsewhere in this CORE_SURFACE.md are DESIGN-level — specific to the current MFE handler implementation. They MUST NOT appear in PRD prose. They appear in ADR / DESIGN / FEATURE artifacts:

- Lifecycle stages (the named states extensions pass through)
- Actions chains (the success/failure-branching sequences bound to lifecycle stages)
- Mount strategies (Concurrent / Exclusive / Optional)
- Extension domains (as a structural concept; "domain" as a slot name is OK at PRD level)
- Bridge (parent/child communication artifact)
- Type-system plugin abstraction
- TypeSystemPlugin interface, registerSchema/validateInstance/isTypeOf
- Module Federation (and any specific loader strategy)
- Blob URL isolation
- GTS / GTS spec (as PRD-level descriptor; appears only in §10 Dependencies)
- REST / SSE / HTTP / JSON Schema (as PRD-level descriptors)
- Plugin (as a pattern noun outside §2.2 actor identification)
- Abstraction (as a pattern noun)
- Interface (in the implementation sense)
- Short-circuit response, SharedFetchCache, retry depth, etc.

The 3 pillars from the section above are vision-level (PRD §1 / §4 anchor), NOT design-level. They appear in PRD prose.

At PRD level, the same product is described in user-capability terms:

- "Extensions can be loaded into the application at runtime"
- "Multiple extensions can occupy the same area of the application when the domain permits it"
- "Extensions can communicate with the host application and react to host state changes"
- "Extensions and their bindings are validated against type definitions at registration"
- "Templates can be installed and composed by versioned reference"
- "Existing projects can be upgraded to newer template versions"
- "AI agents discover and use ecosystem-specific skills and workflows; templates can bundle additional skills that the AI tooling framework discovers when the template is installed"
- "Project upgrades can be driven by AI agents using the AI tooling framework's orchestration capabilities"

The PRD purity gate enforces this — see the kickoff file for the gate's implementation. Any subsequent planner / executor session that confuses capability for mechanism MUST escalate to overseer before propagating the confusion downstream.

## Ecosystem inventory

| Artifact | Form | Version | Source location | Distribution |
|---|---|---|---|---|
| `@cyberfabric/mfes` | npm package | `0.3.0-alpha.0` | `packages/mfes/` | npm |
| `@cyberfabric/gts-plugin` | npm package | `0.3.0-alpha.0` | `packages/gts-plugin/` | npm |
| `@cyberfabric/api` | npm package | `0.3.0-alpha.0` | `packages/api/` | npm |
| `@cyberfabric/cli` | npm package | `0.3.0-alpha.0` | `packages/cli/` | npm |
| `cyber-pilot-kit-frontx` | Cypilot kit | `0.3.0-alpha.0` | `cypilot-kit/` | GitHub tarball, CI-mirrored to `cyberfabric/cyber-pilot-kit-frontx` |

Anything not in this table is out of the ecosystem and lives in a template repo.

## Mechanical boundary rules

These are CI-enforceable invariants. A PR violating any of them does not merge.

### Rule MFES-1 — No GTS string literals in `@cyberfabric/mfes`
Grep `^|[^A-Za-z0-9_]"gts\.` against `packages/mfes/src/**` — zero matches required.

### Rule MFES-2 — No solution-specific shared-property identifiers in `@cyberfabric/mfes`
No exported constants or enum values named `THEME`, `LANGUAGE`, `LOCALE`, `DARK`, `LIGHT`, `LTR`, `RTL`, or analogous solution terms.

### Rule MFES-3 — No specific layout domain values in `@cyberfabric/mfes`
No exported enum values or string literals named `Header`, `Footer`, `Menu`, `Sidebar`, `Screen`, `Popup`, `Overlay`, or analogous layout terms.

### Rule MFES-4 — No type-system format dependencies in `@cyberfabric/mfes`
`packages/mfes/package.json` MUST NOT declare `@globaltypesystem/gts-ts` (or any other type-system implementation library) under `dependencies` or `peerDependencies`.

### Rule MFES-5 — Type-system format types live with the plugin
`@cyberfabric/mfes` defines an opaque `Schema` interface exposing only `id`. Format-specific schema types (`JSONSchema`, YAML schema descriptors, Protobuf descriptors, etc.) extend `Schema` and live in their respective plugin packages. `@cyberfabric/mfes` source code MUST NOT access any property of a `Schema` instance other than `id`.

### Rule GTS-PLUGIN-1 — `@cyberfabric/gts-plugin` owns all infrastructure GTS schemas
The package owns the JSON schemas describing the contracts that `@cyberfabric/mfes` runtime operates on: `mfe-entry`, `mfe-entry-mf`, `extension-domain`, `extension`, `action`, `actions-chain`, `lifecycle-stage`, `lifecycle-hook`, `mf-manifest`. Plus the 4 default lifecycle-stage instances.

### Rule GTS-PLUGIN-2 — `@cyberfabric/gts-plugin` does NOT own solution-specific GTS schemas
Schemas for specific shared properties (theme, language, etc.) and specific extension specializations (screen-extension, etc.) live in templates and are registered with `gtsPlugin` at boot time via `registerSchema()`.

### Rule API-1 — No solution-specific content in `@cyberfabric/api`
The package ships protocol abstractions, plugin abstractions, descriptor types, and cache-lifecycle hooks. Concrete endpoints, concrete mocks, TanStack types, and authentication wiring do not appear in this package.

### Rule CLI-1 — `@cyberfabric/cli` has zero dependency on any template
No template names hardcoded. No template content. CLI resolves templates by source spec at runtime.

### Rule KIT-1 — `cyber-pilot-kit-frontx` resource IDs all prefixed `frontx_`
Every `id` declared under `[[resources]]` in the kit's `manifest.toml` MUST begin with `frontx_`. Enforced by the kit's own self-validation and by `frontx template validate` cross-checking when templates' sub-kits are registered.

## Package surfaces

### `@cyberfabric/mfes`

The MFE runtime — registry, handler, bridge, lifecycle, actions chains, plus the TypeSystemPlugin abstraction. Today's Module Federation handler ships as the default implementation.

**Public surface:**

| Category | Symbols |
|---|---|
| Registry | `MfeRegistry` (abstract), `MfeRegistryFactory` (abstract), `mfeRegistryFactory` (default factory singleton), `MfeRegistryConfig` |
| Handler | `MfeHandler` (abstract), `MfeHandlerMF` (today's MF impl), `MfeMountContext`, `MfeEntryLifecycle` |
| Bridge | `ParentMfeBridge` (abstract), `ChildMfeBridge` (abstract), `MfeBridgeFactory` (abstract), `MfeBridgeFactoryDefault` |
| Domains and extensions | `ExtensionDomainImplementation` (abstract), `ExtensionDomainImplementationFactory` (abstract), `ExtensionMounter` (abstract), `DomainContext`, `DomainLifecycleTrigger` |
| Mount strategies | `MountStrategy` (abstract), `ConcurrentMountStrategy`, `OptionalMountStrategy`, `ExclusiveMountStrategy`, `ContainerHooks`, `ActionPayload` |
| Actions / Mediator | `ActionHandler` (abstract), `ActionsChainsMediator` (abstract), `ChainResult`, `ChainExecutionOptions` |
| Type-system abstraction | `TypeSystemPlugin` (interface), `Schema` (interface — opaque, exposes only `id`), `TypeSystemEntity` (interface), `ValidationResult`, `ValidationErrorItem` |
| Generic types | `MfeEntry`, `MfeEntryMF`, `ExtensionDomain`, `Extension`, `ExtensionPresentation`, `SharedProperty`, `Action`, `ActionsChain`, `LifecycleStage`, `LifecycleHook`, `LoadExtPayload`, `MountExtPayload`, `UnmountExtPayload`, `MfManifest` and its sub-types (`MfManifestMetaData`, `MfManifestRemoteEntry`, `MfManifestBuildInfo`, `MfManifestShared`, `MfManifestAssets`) |
| Utilities | `createShadowRoot`, `injectCssVariables`, `extractGtsPackage` |

**Does not contain:** any `gts.*` string literals, any `FRONTX_*` constants, any specific shared-property names, any `LayoutDomain` values, any `ScreenExtension` type, any Vite/build tooling, any `@globaltypesystem/gts-ts` dependency, any `JSONSchema` type.

**TypeSystemPlugin interface — final shape:**

```ts
interface Schema {
  readonly id: string;
}

interface TypeSystemEntity {
  readonly id?: string;
  readonly type?: string;
}

interface TypeSystemPlugin {
  readonly name: string;
  readonly version: string;
  registerSchema(schema: Schema): void;
  getSchema(typeId: string): Schema | undefined;
  register(entity: TypeSystemEntity): void;
  validateInstance(instanceId: string): ValidationResult;
  isTypeOf(typeId: string, baseTypeId: string): boolean;
}
```

`Schema` exposes only `id` — the one universal property across type-system formats. `@cyberfabric/mfes` source code accesses `schema.id` only; never reads any other field of a `Schema` instance.

---

### `@cyberfabric/gts-plugin`

GTS implementation of `TypeSystemPlugin` plus all infrastructure-level GTS schemas. Depends on `@globaltypesystem/gts-ts`.

**Public surface:**

| Category | Contents |
|---|---|
| Plugin | `GtsPlugin` class, `gtsPlugin` singleton |
| Type-system format specialization | `JSONSchema` (interface, extends `Schema` from `@cyberfabric/mfes`) and the JSON Schema sub-types it composes |
| Infrastructure GTS schemas (JSON files) | `mfe-entry`, `mfe-entry-mf`, `extension-domain`, `extension`, `action`, `actions-chain`, `lifecycle-stage`, `lifecycle-hook`, `mf-manifest` (the 9 ecosystem-required schemas) |
| Default lifecycle-stage instances (JSON) | The 4 default stages (init / activated / deactivated / destroyed) |
| Infrastructure GTS type ID constants | `FRONTX_MFE_ENTRY`, `FRONTX_MFE_ENTRY_MF`, `FRONTX_EXT_DOMAIN`, `FRONTX_EXT_EXTENSION`, `FRONTX_EXT_ACTION`, `FRONTX_ACTION_LOAD_EXT`, `FRONTX_ACTION_MOUNT_EXT`, `FRONTX_ACTION_UNMOUNT_EXT`, `FRONTX_CORE_TYPE_IDS`, `FRONTX_LIFECYCLE_STAGE_IDS`, `FRONTX_MF_TYPE_IDS` |
| Loaders | `loadSchemas`, `loadLifecycleStages` |

**Does not own:** theme schema, language schema, screen-extension schema (those are template-owned). Templates register solution schemas with `gtsPlugin.registerSchema(...)` at boot time.

`JSONSchema extends Schema` from `@cyberfabric/mfes`, so a template's typed JSONSchema can pass through the abstraction-typed methods without casts.

---

### `@cyberfabric/api`

API protocol abstraction, today's REST/SSE implementations, generic plugin abstraction, generic short-circuit mechanism, and cache-lifecycle hook mechanism. **No mock concept at this level** — mocking is owned entirely by templates, including any mock-specific abstraction templates may need.

**Public surface:**

| Category | Symbols |
|---|---|
| Protocols and services | `ApiProtocol`, `RestProtocol`, `SseProtocol`, `RestEndpointProtocol`, `SseStreamProtocol`, `BaseApiService`, `apiRegistry` |
| Generic plugin system | `ApiPluginBase`, `ApiPlugin`, `RestPlugin`, `RestPluginWithConfig`, `SsePlugin`, `SsePluginWithConfig` |
| Generic short-circuit mechanism | `ShortCircuitResponse`, `RestShortCircuitResponse`, `SseShortCircuitResponse`, `isShortCircuit`, `isRestShortCircuit`, `isSseShortCircuit` |
| Contexts and contracts | `ApiRequestContext`, `ApiResponseContext`, `RestRequestContext`, `RestResponseContext`, `RestRequestOptions`, `SseConnectContext`, `EventSourceLike`, `ApiPluginErrorContext` |
| Type definitions | `JsonPrimitive`, `JsonValue`, `JsonObject`, `JsonCompatible`, `HttpMethod`, `MutationMethod`, `ApiServiceConfig`, `ApiServicesConfig`, `RestProtocolConfig`, `SseProtocolConfig`, `BasePluginHooks`, `RestPluginHooks`, `SsePluginHooks`, `PluginClass`, `ProtocolClass`, `ProtocolPluginType`, `ServiceConstructor`, `ApiRegistry` |
| Descriptors | `EndpointDescriptor`, `ParameterizedEndpointDescriptor`, `EndpointOptions`, `MutationDescriptor`, `StreamDescriptor`, `StreamStatus` |
| Cache-lifecycle hooks | `SHARED_FETCH_CACHE_SYMBOL`, `SHARED_FETCH_CACHE_RETAINERS_SYMBOL`, `SharedFetchCache`, `SharedFetchCacheFetchOptions`, `SharedFetchCacheInvalidateFilters`, `createSharedFetchCache`, `getSharedFetchCache`, `peekSharedFetchCache`, `retainSharedFetchCache`, `releaseSharedFetchCache`, `resetSharedFetchCache`, `serializeSharedFetchKey` |

**Mocking ownership:** Mocking is a template-level concern in its entirety, including any abstraction needed. `@cyberfabric/api` does NOT ship `MOCK_PLUGIN`, `isMockPlugin`, `MockMap`, `MockResponseFactory`, `RestMockPlugin`, `SseMockPlugin`, `MockEventSource`, or any mock-named symbol. Templates that need mocking define their own marker (constant or symbol), iterate `apiRegistry.getAll()` to filter plugins by that marker, and own the mock-on/mock-off lifecycle logic themselves. The generic plugin and short-circuit mechanisms above are sufficient for templates to implement mocking on top.

**Does not contain:** all mock-related types and symbols (per above), TanStack types, specific endpoint definitions, authentication wiring, specific data shapes. Cache-lifecycle hooks are library-agnostic — no TanStack types leak through `SharedFetchCache`.

---

### `@cyberfabric/cli`

Template-agnostic CLI. Surface detailed in DESIGN; out of scope for this audit. Hard rule: see Rule CLI-1.

### `cyber-pilot-kit-frontx`

Cypilot kit content. Authored alongside DESIGN and FEATURE artifacts in later phases. All resource IDs prefixed `frontx_*` per Rule KIT-1.

## Out-of-ecosystem inventory

Everything below moves to `frontx-template-standard` (or a sibling template if DESIGN splits further).

### From current `packages/screensets`

| Symbol | Source file | Why template |
|---|---|---|
| `LayoutDomain` enum (Header/Footer/Menu/Sidebar/Screen/Popup/Overlay) | `src/types.ts` | Specific layout choice — solution opinion |
| `ScreenExtension` type | `src/mfe/types/extension.ts` | Specialization tied to a specific layout domain value |
| `FRONTX_SHARED_PROPERTY_THEME` constant + GTS schema | `src/mfe/constants/index.ts` + `src/mfe/gts/frontx.mfes/schemas/...` | Specific shared-property schema |
| `FRONTX_SHARED_PROPERTY_LANGUAGE` constant + GTS schema | same | Specific shared-property schema |
| `FRONTX_SCREEN_EXTENSION_TYPE` constant + GTS schema | same | Specific extension-type schema tied to layout |
| `frontxMfGts` Vite plugin | `src/build/mf-gts.ts` | Build-tool-specific; templates pick their bundler |
| `LazyImportTransformer` | `src/build/mf-gts.ts` | Build-time AST transformer |
| `transformLazyImports` | `src/build/mf-gts.ts` | Build-time helper |

### From current `packages/api`

| Symbol | Why template |
|---|---|
| `RestMockPlugin` + `RestMockConfig` | Concrete mock implementation; mock content is solution-specific |
| `SseMockPlugin` + `SseMockConfig` | Same |
| `MockEventSource` + `SseMockEvent` | Concrete mock implementation |

### From current `packages/*` (whole packages)

| Package | Disposition |
|---|---|
| `@cyberfabric/state` | Moves to `frontx-template-standard`. Specific store choice. |
| `@cyberfabric/i18n` | Moves to `frontx-template-standard`. Specific locale model. |
| `@cyberfabric/auth` | Moves to `frontx-template-standard` or its own template (deferred to DESIGN). |
| `@cyberfabric/framework` (L2) | Moves to `frontx-template-standard`. Plugin composition pattern is template territory. |
| `@cyberfabric/react` (L3) | Moves to `frontx-template-standard`. React-specific. |
| `@cyberfabric/studio` | Moves to `frontx-template-standard` or its own template (deferred to DESIGN). |
| `src/`, `presets/standalone`, `presets/monorepo` (L4) | Moves to `frontx-template-standard`. Application code. |

### Solution GTS schemas owned by `frontx-template-standard`

The template ships its own `gts/` folder with schemas it registers with `gtsPlugin` at app boot:

- `shared_property/theme.v1`
- `shared_property/language.v1`
- `extension/screen.v1`
- any other solution-specific schemas the template introduces

The template's app entry point calls (illustrative):

```ts
import { gtsPlugin } from '@cyberfabric/gts-plugin';
import { themeSchema, languageSchema, screenExtensionSchema } from './gts';

gtsPlugin.registerSchema(themeSchema);
gtsPlugin.registerSchema(languageSchema);
gtsPlugin.registerSchema(screenExtensionSchema);
```

## Logical-to-concrete component mapping (vision context)

This pairing is part of the vision (which logical-level capability maps to which concrete deliverable). It is NOT a PRD-prose rule — kickoff files define how each level appears in artifacts. Listed here as a single point of truth for sessions that need to translate between levels:

| Logical component (PRD level) | Concrete artifact (ADR / DESIGN level) |
|---|---|
| MFE Runtime | `@cyberfabric/mfes` |
| Type System | `@cyberfabric/gts-plugin` (default implementation) |
| API Protocol Surface | `@cyberfabric/api` |
| CLI | `@cyberfabric/cli` |
| AI Tooling Framework | `cyber-pilot-kit-frontx` |

The first-baseline version across all five is `0.3.0-alpha.0`. The distribution model (npm for the four packages, Cypilot kit tarball for the fifth) is a DESIGN concern; it is documented elsewhere, not in PRD prose.

## Open items deferred to later phases

- `@cyberfabric/cli` detailed surface — authored in DESIGN
- `cyber-pilot-kit-frontx` content — authored alongside artifact rules
- Solution GTS schema details — owned by template authors, not by this document
- `@cyberfabric/auth` and `@cyberfabric/studio` template strategy — stay in `frontx-template-standard` or split into separate templates? Deferred to DESIGN.
