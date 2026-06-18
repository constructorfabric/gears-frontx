# PRD — HAI3 Dev Kit

<!-- toc -->

- [1. Overview](#1-overview)
  - [1.1 Purpose](#11-purpose)
  - [1.2 Background / Problem Statement](#12-background--problem-statement)
  - [1.3 Goals (Business Outcomes)](#13-goals-business-outcomes)
  - [1.4 Glossary](#14-glossary)
- [2. Actors](#2-actors)
  - [2.1 Human Actors](#21-human-actors)
  - [2.2 System Actors](#22-system-actors)
- [3. Operational Concept & Environment](#3-operational-concept--environment)
  - [3.1 Module-Specific Environment Constraints](#31-module-specific-environment-constraints)
- [4. Scope](#4-scope)
  - [4.1 In Scope](#41-in-scope)
  - [4.2 Out of Scope](#42-out-of-scope)
- [5. Functional Requirements](#5-functional-requirements)
  - [5.1 SDK Core](#51-sdk-core)
  - [5.2 App Configuration](#52-app-configuration)
  - [5.3 SSE Streaming](#53-sse-streaming)
  - [5.4 MFE Type System](#54-mfe-type-system)
  - [5.5 MFE Core](#55-mfe-core)
  - [5.6 MFE Blob URL Isolation](#56-mfe-blob-url-isolation)
  - [5.7 MFE Externalize Plugin](#57-mfe-externalize-plugin)
  - [5.8 MFE Internal Dataflow](#58-mfe-internal-dataflow)
  - [5.9 MFE Share Scope Management](#59-mfe-share-scope-management)
  - [5.10 Shared Property Broadcast](#510-shared-property-broadcast)
  - [5.11 Shared Property Validation](#511-shared-property-validation)
  - [5.12 i18n Formatters](#512-i18n-formatters)
  - [5.13 i18n Loading](#513-i18n-loading)
  - [5.14 Studio](#514-studio)
  - [5.15 CLI](#515-cli)
  - [5.16 Publishing](#516-publishing)
  - [5.17 Mock Mode](#517-mock-mode)
  - [5.18 Microfrontend Plugin](#518-microfrontend-plugin)
- [6. Non-Functional Requirements](#6-non-functional-requirements)
  - [6.1 NFR Inclusions](#61-nfr-inclusions)
  - [6.2 NFR Exclusions](#62-nfr-exclusions)
- [7. Public Library Interfaces](#7-public-library-interfaces)
  - [7.1 Public API Surface](#71-public-api-surface)
  - [7.2 External Integration Contracts](#72-external-integration-contracts)
- [8. Use Cases](#8-use-cases)
- [9. Acceptance Criteria](#9-acceptance-criteria)
- [10. Dependencies](#10-dependencies)
- [11. Assumptions](#11-assumptions)
- [12. Risks](#12-risks)

<!-- /toc -->

## 1. Overview

### 1.1 Purpose

HAI3 is an AI-optimized UI development kit that accelerates the creation of production-ready interfaces from concept to deployment. It bridges the gap between rapid prototyping (Drafts → Mockups) and scalable production systems through a layered architecture that decouples domain logic, UI components, and business functionality. Built on React 19 with TypeScript, Vite, and Redux Toolkit, HAI3 provides a plugin-based framework enabling developers to extend functionality without modifying core code.

The dev kit targets teams building internal tools, dashboards, AI-powered applications, and embedded UI systems. It standardizes patterns for state management, API integration, localization, component reuse, and extensibility while maintaining full control over UI rendering through a customizable UI kit built on shadcn/ui.

### 1.2 Background / Problem Statement

Modern UI frameworks optimize for component reuse and visual design, but fail at enforcing architectural discipline across multiple teams and long-lived projects. Developers face recurring challenges:

- **State Management Chaos**: Mixed patterns (direct dispatch, imperative logic in components, async middleware) create unpredictable state flow and hard-to-trace bugs.
- **API Integration Scattered**: Services coupled to specific protocols (REST vs streaming), mocking logic mixed with business logic, no support for dynamic protocol switching.
- **Localization Friction**: Translation files either monolithic (loaded all-at-once wasting bandwidth) or completely decentralized (inconsistent patterns).
- **Screensets Siloed**: Individual teams own "screens" but lack a standard way to extend the app without modifying core code; integration of third-party features requires custom wiring.
- **Monorepo Bloat**: Framework code, UI components, app templates, and build tools entangled in single packages, forcing unnecessary dependencies.
- **No Clear Upgrade Path**: Breaking changes to core packages ripple across all screens; adding new features requires updating multiple layers.

HAI3 solves these by enforcing a proven architectural model with four isolated layers: flat SDK packages (zero inter-dependencies), composable framework plugins, React adapters, and user-owned layout templates. The framework enforces event-driven Flux patterns and zero cross-layer dependencies, ensuring applications remain maintainable as they scale from single screens to complex multi-feature applications with microfrontend deployments.

### 1.3 Goals (Business Outcomes)

| Goal | Baseline | Target | Timeframe |
|------|----------|--------|-----------|
| Time to Production | 4-6 weeks (custom architecture + component library integration) | 1-2 weeks (scaffold + plugin composition) | 2026 Q3 |
| Team Onboarding | 3-5 days (learn monolithic patterns + project-specific rules) | 6-8 hours (four-layer model + plugin API) | 2026 Q2 |
| Bundle Size | 680KB (all features bundled, even unused) | <250KB dev, <180KB prod (tree-shaken per-feature) | 2026 Q3 |
| Per-Screen Load Time | 1.2s (all screens pre-bundled, lazy-load only images) | <400ms (screens + translations lazy-loaded on-demand) | 2026 Q2 |
| Screenset Onboarding | 8-10 hours (study uicore, copy demo, adapt) | 45 min (scaffold + modify single file) | 2026 Q2 |

### 1.4 Glossary

| Term | Definition |
|------|------------|
| Action | Function that emits events on the EventBus. Never calls `getState()`, never async — async work moved to services/effects. |
| Effect Initializer | Function that subscribes to events and dispatches reducers to update Redux state. Called once per slice registration, returns optional cleanup. |
| Reducer | Pure function that updates Redux state based on a ReducerPayload. Exported as standalone functions, NOT via `.actions` property. |
| Screenset | Vertical slice: group of related screens + translations + API services + state, self-contained and deployable independently. |
| Extension / MFE Entry | Loaded microfrontend (via Module Federation) bound to an extension domain; exposes actions and properties for host app communication. |
| Extension Domain | Contract definition for a category of extensions: shared properties, actions host can send, actions extensions can send, lifecycle. |
| Plugin | Framework-level feature (screensets, themes, i18n, routing, effects, microfrontends, layout) composed via `.use()` on `createHAI3` builder. |
| Shared Property | Observable value broadcast to all extensions (e.g., theme, language). Propagated by owning plugin. |
| Studio | Standalone dev tools overlay (theme selector, language picker, API mode toggle, floating panel). Only loaded in `import.meta.env.DEV`. |
| UI Kit | Component library: per-project choice at creation (local components, shadcn, or third-party). |
| Registry | Self-registering singleton (ScreensetsRegistry, ThemeRegistry, I18nRegistry, ApiRegistry). Updated dynamically at runtime. |
| GTS | Global Type System — schema-based validation for MFE shared properties and action chains. |
| CDSL | Cypilot Domain-Specific Language for describing flows, algorithms, and states in FEATURE specs. |

## 2. Actors

> **Note**: Stakeholder needs are managed at project/task level by steering committee. Document **actors** (users, systems) that interact with this module.

### 2.1 Human Actors

#### Application Developer

**ID**: `cpt-hai3-actor-developer`

**Role**: Frontend/fullstack engineer who writes screensets (screen components, actions, effects, slices), integrates API services, adds translations, and extends plugins via composition.
**Needs**: Clear SDK APIs, consistent patterns, type-safe hooks, fast scaffolding via CLI, reliable build tooling.

#### Screenset Author

**ID**: `cpt-hai3-actor-screenset-author`

**Role**: Creates self-contained vertical slices with screens, translations, API services, and state. Registers translations via localization config and implements custom API services.
**Needs**: Self-contained packaging, namespace isolation, lazy-loading support, MFE extension points.

#### Studio User

**ID**: `cpt-hai3-actor-studio-user`

**Role**: Developer using the floating dev panel to toggle themes, screensets, languages, and mock API mode during development.
**Needs**: Quick access (keyboard shortcut), persistent settings, zero production footprint.

#### End User

**ID**: `cpt-hai3-actor-end-user`

**Role**: Uses the built application — interacts with screens, navigates, switches themes/languages, triggers API calls, receives real-time updates.
**Needs**: Responsive load times (<400ms per screen), accessible UI, locale-aware formatting.

### 2.2 System Actors

#### Host Application

**ID**: `cpt-hai3-actor-host-app`

**Role**: Initializes HAI3 via `createHAI3().use(...).build()`, registers screensets, provides `HAI3Provider` to React tree, emits configuration events (tenant, language, theme).

#### Build System

**ID**: `cpt-hai3-actor-build-system`

**Role**: Compiles TypeScript via Vite + tsup, tree-shakes dev-only code, bundles monorepo packages, generates Module Federation manifests, runs ESLint/dependency-cruiser/knip checks, publishes packages.

#### Browser Runtime

**ID**: `cpt-hai3-actor-runtime`

**Role**: Evaluates JavaScript modules and lazy-loaded screens, maintains Redux store and EventBus subscriptions, renders React components, handles API calls, persists state to localStorage.

#### Framework Plugin

**ID**: `cpt-hai3-actor-framework-plugin`

**Role**: Implements plugin interface via `.use(featureName(config))`. Provides slices, effects, actions, registries. Subscribes to event bus for cross-plugin communication.

#### API Protocol

**ID**: `cpt-hai3-actor-api-protocol`

**Role**: Implements `ApiProtocol` interface with `initialize()`, `cleanup()`, and custom methods. Registered in `BaseApiService` by constructor name. Supports plugin chains.

#### Microfrontend Runtime

**ID**: `cpt-hai3-actor-microfrontend`

**Role**: Module Federation container that exposes screens/components loaded by host app at runtime. Receives actions from host, broadcasts shared properties. Each instance is blob-URL-isolated.

#### CI/CD Pipeline

**ID**: `cpt-hai3-actor-ci-cd`

**Role**: Validates (TypeScript strict, ESLint, dependency-cruiser, knip), tests, builds packages in layer order, publishes to npm. Enforces architecture rules.

#### GTS Plugin

**ID**: `cpt-hai3-actor-gts-plugin`

**Role**: Validates MFE shared properties and action chains against GTS schemas. Supports derived schemas for theme/language enums.

#### CLI Tool

**ID**: `cpt-hai3-actor-cli`

**Role**: Scaffolds new projects (`hai3 create`), generates layout and screenset code (`hai3 scaffold`), runs migrations (`hai3 migrate`), syncs AI tool configs (`hai3 ai sync`).

## 3. Operational Concept & Environment

### 3.1 Module-Specific Environment Constraints

HAI3 is an npm workspace monorepo (`gears-frontx-monorepo`) structured as:

```
packages/           -- Published @gears-frontx/* packages
  state/            -- L1 SDK: EventBus, Store, createSlice
  screensets/       -- L1 SDK: MFE contracts, registry, Shadow DOM
  api/              -- L1 SDK: REST/SSE protocols, plugin system
  i18n/             -- L1 SDK: 36-language i18n, formatters
  framework/        -- L2: Plugin architecture, layout slices
  react/            -- L3: HAI3Provider, hooks, MFE components
  studio/           -- Dev: Floating overlay with controls
  cli/              -- Tool: Scaffolding CLI
  docs/             -- VitePress documentation site
internal/           -- Non-published internal tooling
src/                -- Demo host application + MFE packages
```

**Build orchestration**: Sequential layer build — SDK (parallel) → framework → react → studio → cli.

**Development**: `npm run dev` generates MFE manifests and color tokens, then starts Vite dev server.

**Architecture checks**: `npm run arch:check`, `arch:deps`, `arch:unused` validate layer boundaries and unused exports.

## 4. Scope

### 4.1 In Scope

- State management — EventBus pub/sub, Redux-backed store with dynamic slice registration, effect system
- MFE runtime — ScreensetsRegistry, extension lifecycle, actions chain mediation, domain management, GTS validation
- API communication — REST and SSE protocols, plugin chain, mock mode, retry with exponential backoff
- Internationalization — 36 languages, RTL support, namespace-based translations, lazy loading, locale-aware formatters
- Plugin architecture — Composable plugins, presets (full, minimal, headless)
- Layout state — 7 domain slices (header, footer, menu, sidebar, screen, popup, overlay), tenant, mock
- React integration — HAI3Provider, typed hooks, MFE hooks
- UI component library — shadcn/ui + Radix UI primitives, variant system, theming
- Developer studio — Runtime overlay with MFE package selector, theme/language/API mode toggles
- CLI tooling — Project scaffolding, screenset generation, migration runners, AI tool sync
- MFE isolation — Blob URL per-runtime isolation, Shadow DOM CSS isolation
- Architecture enforcement — Dependency-cruiser rules, Knip unused export detection

### 4.2 Out of Scope

- Server-side rendering (SSR) — Client-side SPA architecture only
- Backend/BFF — API layer provides client-side protocols only
- Authentication implementation — Framework provides templates but no auth logic
- Production MFE registry/discovery — No backend catalog; extensions registered at runtime via code
- Cross-MFE shared state — Explicitly rejected; each MFE has isolated store
- Layout rendering components — Generated by CLI into user's project, not in any @gears-frontx package
- WebSocket protocol — Only REST and SSE implemented
- Database schemas — N/A (client-side library)

## 5. Functional Requirements

> **Testing strategy**: All requirements verified via automated tests (unit, integration, e2e) targeting 90%+ code coverage unless otherwise specified. Document verification method only for non-test approaches.

### 5.1 SDK Core

#### Flat SDK Packages

- [x] `p1` - **ID**: `cpt-hai3-fr-sdk-flat-packages`

The system MUST provide 4 flat SDK packages (`@gears-frontx/state`, `@gears-frontx/screensets`, `@gears-frontx/api`, `@gears-frontx/i18n`) with ZERO `@gears-frontx/*` inter-dependencies.

**Rationale**: Enables independent consumption and parallel builds. Each package has only external peer dependencies.
**Actors**: `cpt-hai3-actor-developer`, `cpt-hai3-actor-build-system`

#### State Package Interface

- [x] `p1` - **ID**: `cpt-hai3-fr-sdk-state-interface`

`@gears-frontx/state` MUST export EventBus (singleton + interface), `createStore`, `getStore`, `registerSlice`, `unregisterSlice`, `hasSlice`, `getRegisteredSlices`, `resetStore`, `createSlice`, and types `ReducerPayload`, `EventPayloadMap`, `RootState`, `AppDispatch`, `EffectInitializer`, `HAI3Store`, `SliceObject`, `EventHandler`, `Subscription`.

**Rationale**: Complete state management foundation for event-driven Flux architecture.
**Actors**: `cpt-hai3-actor-developer`

#### HAI3 Flux Terminology

- [x] `p2` - **ID**: `cpt-hai3-fr-sdk-flux-terminology`

The system MUST use consistent HAI3 Flux terminology: Action (emits events), Event (past-tense message), Effect (subscribes + calls reducers), Reducer (pure state update), Slice (reducers + initial state). The terms "action creator" and "dispatch" MUST NOT appear in public API.

**Rationale**: Avoids confusion with Redux terminology; enforces HAI3 event-driven patterns.
**Actors**: `cpt-hai3-actor-developer`

#### Screensets Package

- [x] `p1` - **ID**: `cpt-hai3-fr-sdk-screensets-package`

`@gears-frontx/screensets` MUST export `LayoutDomain` enum, MFE type system (`MfeEntry`, `MfeEntryMF`, `Extension`, `ScreenExtension`, `ExtensionDomain`, `SharedProperty`, `Action`, `ActionsChain`), `ScreensetsRegistry`, `MfeHandler`, `MfeBridgeFactory`, and action/property constants. It MUST have ZERO `@gears-frontx/*` dependencies.

**Rationale**: MFE contracts must be consumable without pulling in framework or React.
**Actors**: `cpt-hai3-actor-developer`, `cpt-hai3-actor-microfrontend`

#### API Package

- [x] `p1` - **ID**: `cpt-hai3-fr-sdk-api-package`

`@gears-frontx/api` MUST export `BaseApiService`, `RestProtocol`, `SseProtocol`, `RestMockPlugin`, `SseMockPlugin`, `MockEventSource`, `ApiPluginBase`, `ApiPlugin`, `ApiProtocol`, `apiRegistry`, and type guards `isShortCircuit`/`isRestShortCircuit`/`isSseShortCircuit`. It MUST have only `axios` as peer dependency.

**Rationale**: Protocol-agnostic API layer with pluggable mock mode.
**Actors**: `cpt-hai3-actor-developer`, `cpt-hai3-actor-api-protocol`

#### i18n Package

- [x] `p1` - **ID**: `cpt-hai3-fr-sdk-i18n-package`

`@gears-frontx/i18n` MUST export `I18nRegistry`, `Language` enum (36 languages), `TranslationLoader`, `SUPPORTED_LANGUAGES`, `getLanguageMetadata`, `getRTLLanguages`, formatters (`formatDate`, `formatTime`, `formatDateTime`, `formatRelative`, `formatNumber`, `formatPercent`, `formatCompact`, `formatCurrency`, `compareStrings`, `createCollator`), and `TextDirection`/`LanguageDisplayMode` types. It MUST have ZERO dependencies.

**Rationale**: Full i18n foundation with zero-dependency constraint for maximum portability.
**Actors**: `cpt-hai3-actor-developer`

#### Framework Layer

- [x] `p1` - **ID**: `cpt-hai3-fr-sdk-framework-layer`

`@gears-frontx/framework` MUST depend only on SDK packages (state, screensets, api, i18n), MUST NOT depend on React, and MUST provide layout domain state types, registries, effect coordination, `createHAI3()` builder, and `createHAI3App()` convenience function.

**Rationale**: Framework wires SDK capabilities into composable plugins without React coupling.
**Actors**: `cpt-hai3-actor-host-app`, `cpt-hai3-actor-framework-plugin`

#### Action Pattern

- [x] `p1` - **ID**: `cpt-hai3-fr-sdk-action-pattern`

Actions MUST be handwritten pure functions that emit events via `eventBus.emit()`. Actions MUST NOT dispatch directly to Redux. No `createAction` helper MUST be exported from SDK packages. Components MUST NOT use `eventBus` directly.

**Rationale**: Enforces event-driven architecture; prevents direct Redux coupling.
**Actors**: `cpt-hai3-actor-developer`

#### Plugin Architecture

- [x] `p1` - **ID**: `cpt-hai3-fr-sdk-plugin-arch`

`@gears-frontx/framework` MUST provide a plugin-based architecture via `createHAI3()` builder with `.use()` and `.build()`. Plugins MUST declare name, optional dependencies, and optional provides. Presets MUST include `full()`, `minimal()`, `headless()`.

**Rationale**: Composable feature set; applications only pay for what they use.
**Actors**: `cpt-hai3-actor-host-app`, `cpt-hai3-actor-framework-plugin`

#### React Adapter Layer

- [x] `p2` - **ID**: `cpt-hai3-fr-sdk-react-layer`

`@gears-frontx/react` MUST depend only on `@gears-frontx/framework`, MUST provide `HAI3Provider` and hooks (`useAppDispatch`, `useAppSelector`, `useTranslation`, `useNavigation`, `useTheme`, `useFormatters`), and MUST NOT contain layout components or UI kit dependencies.

**Rationale**: Thin React binding; keeps React-specific code isolated from framework logic.
**Actors**: `cpt-hai3-actor-developer`

#### Layer Dependency Rules

- [x] `p1` - **ID**: `cpt-hai3-fr-sdk-layer-deps`

SDK packages (L1) MUST have ZERO `@gears-frontx/*` deps. Framework (L2) MUST depend only on SDK. React (L3) MUST depend only on Framework. User code MAY import from any layer.

**Rationale**: Enforces clean dependency graph; prevents circular coupling.
**Actors**: `cpt-hai3-actor-build-system`

#### Type-Safe Module Augmentation

- [x] `p2` - **ID**: `cpt-hai3-fr-sdk-module-augmentation`

The system MUST use TypeScript module augmentation for `EventPayloadMap` and `RootState` extensibility. Custom events MUST be type-safe in `eventBus.emit()` and `eventBus.on()`.

**Rationale**: Type safety for cross-package event communication without coupling.
**Actors**: `cpt-hai3-actor-developer`

### 5.2 App Configuration

#### Tenant Type and Events

- [x] `p1` - **ID**: `cpt-hai3-fr-appconfig-tenant`

The system MUST define a `Tenant` type with `{ id: string }`. Tenant state MUST be typed as `Tenant | null`. The system MUST provide tenant change events (`app/tenant/changed`, `app/tenant/cleared`) via event bus, with corresponding action functions (`changeTenant`, `clearTenantAction`, `setTenantLoadingState`).

**Rationale**: Tenant context is the foundation for multi-tenant applications.
**Actors**: `cpt-hai3-actor-host-app`

#### Event-Driven Configuration

- [x] `p1` - **ID**: `cpt-hai3-fr-appconfig-event-api`

The system MUST support event-driven configuration for tenant, language, theme, and navigation. Configuration changes MUST propagate through the event bus, not through direct state mutation.

**Rationale**: Event-driven patterns ensure all listeners (including MFE plugins) receive configuration changes.
**Actors**: `cpt-hai3-actor-host-app`, `cpt-hai3-actor-framework-plugin`

#### Router Configuration

- [x] `p1` - **ID**: `cpt-hai3-fr-appconfig-router-config`

The system MUST provide router mode configuration via `HAI3Config.routerMode` supporting `'browser'` (default), `'hash'`, and `'memory'` types.

**Rationale**: Different deployment environments require different routing strategies.
**Actors**: `cpt-hai3-actor-host-app`

#### Layout Visibility

- [x] `p2` - **ID**: `cpt-hai3-fr-appconfig-layout-visibility`

The system MUST provide layout visibility control for footer, menu, and sidebar via imperative action functions (`setFooterVisible`, `setMenuVisible`, `setSidebarVisible`). Unspecified parts MUST default to visible (footer, menu) or hidden (sidebar).

**Rationale**: Applications need to control which layout regions are visible.
**Actors**: `cpt-hai3-actor-host-app`

### 5.3 SSE Streaming

#### SSE Protocol

- [x] `p1` - **ID**: `cpt-hai3-fr-sse-protocol`

The system MUST provide an `SseProtocol` class that wraps browser `EventSource` API with async `connect()`, `disconnect()`, `cleanup()`, and plugin chain support via `getPluginsInOrder()`.

**Rationale**: Server-Sent Events enable real-time data streaming (chat, notifications).
**Actors**: `cpt-hai3-actor-api-protocol`, `cpt-hai3-actor-developer`

#### Plugin-Based Mock Mode

- [x] `p2` - **ID**: `cpt-hai3-fr-sse-mock-mode`

SSE protocol MUST use plugin composition for mock streaming via `SseMockPlugin`. Mock MUST NOT create real `EventSource` instances. Mock returns `MockEventSource` via plugin short-circuit pattern.

**Rationale**: Development and testing without backend dependencies.
**Actors**: `cpt-hai3-actor-developer`

#### Protocol Registry

- [x] `p1` - **ID**: `cpt-hai3-fr-sse-protocol-registry`

`BaseApiService` MUST use protocol registry pattern. Protocols MUST be registered by constructor name, accessible via type-safe `protocol<T>()` method. `cleanup()` MUST destroy all protocols and plugins.

**Rationale**: Extensible protocol architecture; services can use REST, SSE, or custom protocols.
**Actors**: `cpt-hai3-actor-api-protocol`

#### Type-Safe SSE Events

- [x] `p2` - **ID**: `cpt-hai3-fr-sse-type-safe-events`

SSE-related events MUST be type-safe via `EventPayloadMap` module augmentation.

**Rationale**: Compile-time safety for event-driven SSE integration.
**Actors**: `cpt-hai3-actor-developer`

### 5.4 MFE Type System

#### MFE Entry Types

- [x] `p1` - **ID**: `cpt-hai3-fr-mfe-entry-types`

The system MUST define `MfeEntry` (base with id, requiredProperties, actions, domainActions), `MfeEntryMF` (extends with manifest, exposedModule), `Extension` (id, domain, entry), `ScreenExtension` (extends with presentation: label, route, optional icon/order). All types MUST have an `id: string` field.

**Rationale**: Type contracts for MFE communication between host and extensions.
**Actors**: `cpt-hai3-actor-microfrontend`, `cpt-hai3-actor-developer`

#### Extension Domain

- [x] `p1` - **ID**: `cpt-hai3-fr-mfe-ext-domain`

`ExtensionDomain` MUST have id, sharedProperties, actions, extensionsActions, defaultActionTimeout (required number), lifecycleStages (required), extensionsLifecycleStages (required). It MAY have extensionsTypeId.

**Rationale**: Defines the communication contract between host app and MFE extensions.
**Actors**: `cpt-hai3-actor-host-app`, `cpt-hai3-actor-microfrontend`

#### Shared Property Type

- [x] `p1` - **ID**: `cpt-hai3-fr-mfe-shared-property`

`SharedProperty` MUST have `id: string` and `value: unknown`. Shared property constants MUST be GTS type IDs.

**Rationale**: Type-safe shared property broadcasting with schema validation.
**Actors**: `cpt-hai3-actor-microfrontend`

#### Action and Actions Chain Types

- [x] `p1` - **ID**: `cpt-hai3-fr-mfe-action-types`

`Action` MUST have type (string), target (string), optional payload and timeout. `ActionsChain` MUST contain action, optional next and fallback (recursive). Neither MUST have an id field.

**Rationale**: Chain-based action execution with fallback support for resilient MFE communication.
**Actors**: `cpt-hai3-actor-microfrontend`

### 5.5 MFE Core

#### Dynamic Registration

- [x] `p1` - **ID**: `cpt-hai3-fr-mfe-dynamic-registration`

The system MUST support dynamic registration of MFE extensions and domains at runtime; there MUST NOT be static configuration.

**Rationale**: Extensions are loaded on-demand; the set of available extensions is not known at build time.
**Actors**: `cpt-hai3-actor-host-app`

#### Theme Propagation via Plugin

- [x] `p1` - **ID**: `cpt-hai3-fr-mfe-theme-propagation`

The `themes()` plugin MUST call `screensetsRegistry?.updateSharedProperty(HAI3_SHARED_PROPERTY_THEME, themeId)` in its `theme/changed` event handler, wrapped in try/catch.

**Rationale**: Theme changes must propagate to all MFE extensions. Owned by themes plugin, not microfrontends.
**Actors**: `cpt-hai3-actor-framework-plugin`

#### Language Propagation via Plugin

- [x] `p1` - **ID**: `cpt-hai3-fr-mfe-i18n-propagation`

The `i18n()` plugin MUST call `screensetsRegistry?.updateSharedProperty(HAI3_SHARED_PROPERTY_LANGUAGE, language)` in its `i18n/language/changed` event handler, wrapped in try/catch.

**Rationale**: Language changes must propagate to all MFE extensions. Owned by i18n plugin, not microfrontends.
**Actors**: `cpt-hai3-actor-framework-plugin`

### 5.6 MFE Blob URL Isolation

#### Fresh Module Evaluation

- [x] `p1` - **ID**: `cpt-hai3-fr-blob-fresh-eval`

`MfeHandlerMF` MUST use Blob URLs to produce a fresh ES module evaluation per MFE load. `Object.is(mfeA_React, mfeB_React)` MUST be `false`.

**Rationale**: Prevents cross-MFE state leakage (React fiber trees, hooks, Redux stores).
**Actors**: `cpt-hai3-actor-microfrontend`

#### No Blob URL Revocation

- [x] `p2` - **ID**: `cpt-hai3-fr-blob-no-revoke`

The handler MUST NOT call `URL.revokeObjectURL()` after `import()` resolves; blob URLs MUST remain valid for the page lifetime.

**Rationale**: Modules with top-level `await` continue evaluating after `import()` resolves.
**Actors**: `cpt-hai3-actor-microfrontend`

#### Source Text Cache

- [x] `p1` - **ID**: `cpt-hai3-fr-blob-source-cache`

`MfeHandlerMF` MUST maintain an in-memory cache of fetched source text strings, keyed by absolute chunk URL. At most ONE network fetch MUST occur per chunk URL across all MFE loads.

**Rationale**: Prevents redundant network requests when multiple MFEs share the same dependency version.
**Actors**: `cpt-hai3-actor-microfrontend`

#### Import Rewriting

- [x] `p1` - **ID**: `cpt-hai3-fr-blob-import-rewriting`

`MfeHandlerMF` MUST rewrite ALL relative imports to absolute URLs using the remoteEntry base URL.

**Rationale**: Blob-evaluated modules cannot resolve relative imports.
**Actors**: `cpt-hai3-actor-microfrontend`

#### Recursive Blob Chain

- [x] `p1` - **ID**: `cpt-hai3-fr-blob-recursive-chain`

`MfeHandlerMF` MUST use `createBlobUrlChain` to recursively create blob URLs for a chunk and all its static dependencies, building a chain of isolated modules.

**Rationale**: Ensures the entire dependency tree gets fresh per-load evaluations.
**Actors**: `cpt-hai3-actor-microfrontend`

#### Per-Load Blob Map

- [x] `p2` - **ID**: `cpt-hai3-fr-blob-per-load-map`

The `blobUrlMap` MUST be scoped to a single load; different MFE loads MUST have independent `blobUrlMap` instances.

**Rationale**: Prevents cross-load blob URL reuse which would break isolation.
**Actors**: `cpt-hai3-actor-microfrontend`

### 5.7 MFE Externalize Plugin

#### Transform All Imports

- [x] `p1` - **ID**: `cpt-hai3-fr-externalize-transform`

A custom Vite plugin (`hai3-mfe-externalize`) MUST transform ALL `import` statements for shared dependencies into `importShared()` calls across the entire MFE bundle, not just expose entry files.

**Rationale**: Federation plugin only transforms expose entries; code-split chunks need the same treatment.
**Actors**: `cpt-hai3-actor-build-system`

#### Deterministic Filenames

- [x] `p1` - **ID**: `cpt-hai3-fr-externalize-filenames`

The plugin MUST configure shared dependency chunks to use deterministic filenames without content hashes.

**Rationale**: Stable `chunkPath` values in MFE manifests across rebuilds.
**Actors**: `cpt-hai3-actor-build-system`

#### Build-Only Operation

- [x] `p2` - **ID**: `cpt-hai3-fr-externalize-build-only`

The plugin MUST operate at build time only (`vite build`); it MUST NOT transform imports during `vite dev`.

**Rationale**: Dev server should not be affected by MFE externalization.
**Actors**: `cpt-hai3-actor-build-system`

### 5.8 MFE Internal Dataflow

#### Isolated MFE App

- [x] `p1` - **ID**: `cpt-hai3-fr-dataflow-internal-app`

Each MFE package MUST create a minimal HAI3App via `createHAI3().use(effects()).use(mock()).build()` and use `HAI3Provider` to provide store context.

**Rationale**: MFEs need isolated Redux store via HAI3 framework, not direct Redux access.
**Actors**: `cpt-hai3-actor-microfrontend`

#### No Direct Redux Imports

- [x] `p1` - **ID**: `cpt-hai3-fr-dataflow-no-redux`

MFE packages MUST NOT import from `react-redux`, `redux`, or `@reduxjs/toolkit` directly. All store access MUST go through `@gears-frontx/react` APIs.

**Rationale**: Direct Redux imports bypass blob URL isolation and break store independence.
**Actors**: `cpt-hai3-actor-microfrontend`

### 5.9 MFE Share Scope Management

#### Share Scope Construction

- [x] `p1` - **ID**: `cpt-hai3-fr-sharescope-construction`

`MfeHandlerMF` MUST construct a `shareScope` from `manifest.sharedDependencies` and write it to `globalThis.__federation_shared__` via `writeShareScope()`. For dependencies with `chunkPath`, the handler MUST create blob-URL-based `get()` closures.

**Rationale**: The shareScope bridges the federation runtime's `importShared()` and blob URL isolation.
**Actors**: `cpt-hai3-actor-microfrontend`

#### Concurrent Load Safety

- [x] `p2` - **ID**: `cpt-hai3-fr-sharescope-concurrent`

When multiple MFEs are loaded concurrently, each load's `get()` closures MUST capture their own `LoadBlobState` instance. At most ONE network fetch MUST occur per chunk URL.

**Rationale**: Concurrent loads must not interfere with each other.
**Actors**: `cpt-hai3-actor-microfrontend`

### 5.10 Shared Property Broadcast

#### Write API

- [x] `p1` - **ID**: `cpt-hai3-fr-broadcast-write-api`

`ScreensetsRegistry` MUST provide `updateSharedProperty(propertyId, value)` as the sole write method. `updateDomainProperty()` and `updateDomainProperties()` MUST NOT exist.

**Rationale**: Shared properties have global semantics — one value across all declaring domains.
**Actors**: `cpt-hai3-actor-host-app`, `cpt-hai3-actor-framework-plugin`

#### Domain-Targeted Propagation

- [x] `p1` - **ID**: `cpt-hai3-fr-broadcast-matching`

When `updateSharedProperty(propertyId, value)` is called, the system MUST validate the value, store it, and propagate to all domains whose `sharedProperties` array includes `propertyId`. Domains that do NOT include the property MUST NOT receive the update.

**Rationale**: Targeted broadcast; only interested domains receive updates.
**Actors**: `cpt-hai3-actor-host-app`

#### Validate Before Propagate

- [x] `p1` - **ID**: `cpt-hai3-fr-broadcast-validate`

GTS validation MUST occur before propagation. If validation fails, the property value MUST NOT be stored or propagated to any domain.

**Rationale**: Invalid values must never reach MFE domains.
**Actors**: `cpt-hai3-actor-gts-plugin`

### 5.11 Shared Property Validation

#### GTS Validation Pattern

- [x] `p1` - **ID**: `cpt-hai3-fr-validation-gts`

The system MUST validate shared property values using `typeSystem.register({ id: ephemeralId, value })` followed by `typeSystem.validateInstance(ephemeralId)`, where `ephemeralId = "${propertyTypeId}frontx.mfes.comm.runtime.v1"`.

**Rationale**: Reuses existing GTS register+validate pattern.
**Actors**: `cpt-hai3-actor-gts-plugin`

#### Reject Invalid Values

- [x] `p1` - **ID**: `cpt-hai3-fr-validation-reject`

When validation fails, `updateSharedProperty()` MUST throw an error containing validation failure details. The property value MUST NOT be stored or propagated.

**Rationale**: Invalid values must be rejected with clear diagnostics.
**Actors**: `cpt-hai3-actor-gts-plugin`

### 5.12 i18n Formatters

#### Locale-Aware Formatters

- [x] `p1` - **ID**: `cpt-hai3-fr-i18n-formatters`

The system MUST provide locale-aware formatters: `formatDate`, `formatTime`, `formatDateTime`, `formatRelative` (using `Intl.DateTimeFormat`/`Intl.RelativeTimeFormat`), `formatNumber`, `formatPercent`, `formatCompact` (using `Intl.NumberFormat`), `formatCurrency` (using `Intl.NumberFormat` style currency), and `compareStrings`/`createCollator` (using `Intl.Collator`). All MUST use `i18nRegistry.getLanguage()` as locale source, falling back to English.

**Rationale**: Locale-specific formatting is essential for international applications.
**Actors**: `cpt-hai3-actor-developer`

#### Formatter Exports

- [x] `p1` - **ID**: `cpt-hai3-fr-i18n-formatter-exports`

All formatters MUST be exported from `@gears-frontx/i18n`, re-exported from `@gears-frontx/framework`, and accessible via `useFormatters()` hook from `@gears-frontx/react`.

**Rationale**: Single import surface across all layers.
**Actors**: `cpt-hai3-actor-developer`

#### Graceful Invalid Input

- [x] `p2` - **ID**: `cpt-hai3-fr-i18n-graceful-invalid`

All formatters MUST return `''` for null, undefined, or invalid inputs and MUST NOT throw.

**Rationale**: Prevents runtime crashes from formatting operations.
**Actors**: `cpt-hai3-actor-runtime`

### 5.13 i18n Loading

#### Hybrid Namespace Support

- [x] `p1` - **ID**: `cpt-hai3-fr-i18n-hybrid-namespace`

The system MUST support two-tier translation namespaces: `screenset.<id>` for shared content and `screen.<screensetId>.<screenId>` for screen-specific content.

**Rationale**: Enables colocated, lazy-loaded screen translations while sharing common keys.
**Actors**: `cpt-hai3-actor-screenset-author`

#### Lazy Screen Translations

- [x] `p1` - **ID**: `cpt-hai3-fr-i18n-lazy-chunks`

Screen translations MUST load on-demand when the screen is lazy-loaded, NOT upfront with the application. Loaded translations MUST be cached.

**Rationale**: Reduces initial bundle and network cost.
**Actors**: `cpt-hai3-actor-runtime`

### 5.14 Studio

#### Floating Panel

- [x] `p1` - **ID**: `cpt-hai3-fr-studio-panel`

The system MUST provide a `StudioPanel` component rendering as a floating overlay with fixed positioning, glassmorphic styling, visible only in dev mode. Users MUST be able to drag, resize, and collapse the panel. All positions and state MUST persist to localStorage.

**Rationale**: Dev-only inspection and configuration tool.
**Actors**: `cpt-hai3-actor-studio-user`

#### Studio Controls

- [x] `p1` - **ID**: `cpt-hai3-fr-studio-controls`

StudioPanel MUST provide: theme selector dropdown, MFE package selector, language selector with native script display, and mock/real API toggle.

**Rationale**: Runtime configuration switching during development.
**Actors**: `cpt-hai3-actor-studio-user`

#### Settings Persistence

- [x] `p1` - **ID**: `cpt-hai3-fr-studio-persistence`

The system MUST persist theme, language, mock API state, and GTS package selection to localStorage on change. On Studio mount, MUST restore all persisted settings. ALL persistence logic MUST live in `@gears-frontx/studio` only.

**Rationale**: Session continuity across page reloads.
**Actors**: `cpt-hai3-actor-studio-user`

#### Viewport Positioning

- [x] `p1` - **ID**: `cpt-hai3-fr-studio-viewport`

The system MUST clamp Studio button and panel positions to the current viewport on load and window resize, maintaining a 20px margin from edges.

**Rationale**: Prevents off-screen elements after display changes.
**Actors**: `cpt-hai3-actor-studio-user`

#### Package Independence

- [x] `p1` - **ID**: `cpt-hai3-fr-studio-independence`

`@gears-frontx/studio` MUST be a standalone workspace package, `"sideEffects": false`, tree-shakeable, excluded from production builds via `import.meta.env.DEV` conditional.

**Rationale**: Zero production footprint.
**Actors**: `cpt-hai3-actor-build-system`

### 5.15 CLI

#### Package Structure

- [x] `p1` - **ID**: `cpt-hai3-fr-cli-package`

The CLI MUST be implemented as workspace package `@gears-frontx/cli` with binary `hai3`, supporting ESM (Node.js 18+) and programmatic API.

**Rationale**: Standard npm CLI distribution.
**Actors**: `cpt-hai3-actor-cli`

#### Core Commands

- [x] `p1` - **ID**: `cpt-hai3-fr-cli-commands`

The CLI MUST provide: `hai3 create <project>` (scaffold new project), `hai3 update` (update packages/templates), `hai3 scaffold layout` (generate layout), `hai3 scaffold screenset <name>` (generate screenset), `hai3 validate components` (validate structure), `hai3 ai sync` (sync AI tool configs), `hai3 migrate [version]` (run code migrations).

**Rationale**: Complete developer workflow from project creation through maintenance.
**Actors**: `cpt-hai3-actor-developer`, `cpt-hai3-actor-cli`

#### Template System

- [x] `p1` - **ID**: `cpt-hai3-fr-cli-templates`

The CLI MUST use a template system with `copy-templates.ts` build script, manifest.json, and screenset templates. Templates MUST be user-owned (not locked in node_modules).

**Rationale**: Consistent scaffolding with full user control over generated code.
**Actors**: `cpt-hai3-actor-cli`

#### AI Skills Assembly

- [x] `p1` - **ID**: `cpt-hai3-fr-cli-skills`

The CLI build MUST generate IDE guidance files and command adapters for supported tools: `CLAUDE.md`, `.cursor/rules/`, `.windsurf/rules/`, `.claude/commands/`, `.cursor/commands/`, `.windsurf/workflows/`, and `.github/copilot-commands/`.

**Rationale**: Distributes AI assistant integrations with every scaffolded project.
**Actors**: `cpt-hai3-actor-cli`

#### E2E Scaffold Verification

- [x] `p1` - **ID**: `cpt-hai3-fr-cli-e2e-verification`

The repository MUST run a dedicated required GitHub Actions PR workflow (`cli-pr-e2e`) that verifies the freshly scaffolded default app is installable, buildable, and type-check clean on Node 24.14.x. A separate non-required nightly workflow MUST cover broader CLI scenarios (custom UIKit, layer scaffolds, migrate commands, invalid-name rejection, ai sync idempotency). Both workflows MUST persist step-level logs as CI artifacts.

**Rationale**: The generated project is the primary CLI deliverable; a green CLI package build alone does not prove the scaffold path works end-to-end.
**Actors**: `cpt-hai3-actor-build-system`, `cpt-hai3-actor-cli`

### 5.16 Publishing

#### NPM Metadata

- [x] `p1` - **ID**: `cpt-hai3-fr-pub-metadata`

All `@gears-frontx/*` packages MUST include complete NPM metadata: author, license (Apache-2.0), repository, bugs, homepage, keywords, engines (>=18), sideEffects, publishConfig, files, exports.

**Rationale**: NPM publishing readiness and discoverability.
**Actors**: `cpt-hai3-actor-build-system`

#### Aligned Versions

- [x] `p1` - **ID**: `cpt-hai3-fr-pub-versions`

All `@gears-frontx/*` packages MUST use aligned versions (same version number).

**Rationale**: Dependency coherence across the monorepo.
**Actors**: `cpt-hai3-actor-build-system`

#### ESM-First Module Format

- [x] `p1` - **ID**: `cpt-hai3-fr-pub-esm`

All packages MUST use ESM-first module format with `"type": "module"`, dual exports (ESM + CJS), and TypeScript declarations.

**Rationale**: Modern module compatibility with fallback for CJS consumers.
**Actors**: `cpt-hai3-actor-build-system`

#### Automated CI Publishing

- [x] `p1` - **ID**: `cpt-hai3-fr-pub-ci`

When a PR merged to `main` contains version changes, CI MUST automatically publish affected packages to NPM in layer dependency order. The workflow MUST verify version does NOT already exist on NPM before publishing. If any publish fails, the workflow MUST stop immediately.

**Rationale**: Automated release pipeline with safety checks.
**Actors**: `cpt-hai3-actor-ci-cd`

### 5.17 Mock Mode

#### Mock Mode Toggle

- [x] `p2` - **ID**: `cpt-hai3-fr-mock-toggle`

The system MUST provide a `toggleMockMode` action via `mock()` plugin that activates/deactivates all registered mock plugins across all API services. Studio's API mode toggle MUST use this action.

**Rationale**: Centralized mock mode control enables developers and studio users to switch between real and mock API responses without restarting the application.
**Actors**: `cpt-hai3-actor-developer`, `cpt-hai3-actor-studio-user`

### 5.18 Microfrontend Plugin

#### MFE Lifecycle Plugin

- [x] `p1` - **ID**: `cpt-hai3-fr-mfe-plugin`

The system MUST provide a `microfrontends()` framework plugin with actions (`loadExtension`, `mountExtension`, `unmountExtension`, `registerExtension`, `unregisterExtension`) and domain constants (`HAI3_SCREEN_DOMAIN`, `HAI3_SIDEBAR_DOMAIN`, `HAI3_POPUP_DOMAIN`, `HAI3_OVERLAY_DOMAIN`). The plugin MUST orchestrate MFE loading via blob URL isolation, propagate theme and i18n changes to mounted extensions, and bridge shared properties between host and MFE.

**Rationale**: Core orchestration plugin that integrates MFE lifecycle management, theme/i18n propagation, and shared property bridging into the framework's plugin chain.
**Actors**: `cpt-hai3-actor-host-app`, `cpt-hai3-actor-framework-plugin`

## 6. Non-Functional Requirements

### 6.1 NFR Inclusions

#### Lazy Loading Performance

- [x] `p1` - **ID**: `cpt-hai3-nfr-perf-lazy-loading`

All screen extensions MUST be lazy-loaded via dynamic `import()`. MFE bundles MUST be fetched on-demand when `HAI3_ACTION_LOAD_EXT` is executed.

**Threshold**: Screen load time < 400ms on 4G connection.
**Rationale**: Initial bundle must not include all screens; on-demand loading reduces time-to-interactive.

#### Tree-Shakeability

- [x] `p1` - **ID**: `cpt-hai3-nfr-perf-treeshake`

All published packages MUST be tree-shakeable. `sideEffects` field MUST be declared in `package.json`. Studio MUST be tree-shaken in production via `import.meta.env.DEV` conditional.

**Threshold**: Production bundle < 180KB for a minimal app (framework + one screenset).
**Rationale**: Unused code must not be included in production bundles.

#### Blob URL Overhead

- [x] `p2` - **ID**: `cpt-hai3-nfr-perf-blob-overhead`

Blob URL creation for MFE isolation MUST add no more than ~1-5ms per shared dependency per MFE load. Source text MUST be cached in-memory after first fetch.

**Threshold**: < 5ms per dependency; < 50ms total for typical MFE with 10 shared deps.
**Rationale**: Isolation overhead must be imperceptible to users.

#### Action Chain Timeout

- [x] `p2` - **ID**: `cpt-hai3-nfr-perf-action-timeout`

All MFE action chain executions MUST have a timeout. Default chain timeout MUST be 120,000ms.

**Threshold**: Chain completes within 2 minutes or fails with timeout error.
**Rationale**: Prevents indefinitely hanging MFE operations.

#### MFE Error Handling

- [x] `p1` - **ID**: `cpt-hai3-nfr-rel-error-handling`

All async MFE operations MUST use try/catch with typed error classes. MFE loading MUST support configurable retry with exponential backoff (default: 2 retries, 1000ms initial delay).

**Threshold**: Max 3 attempts before failure; exponential delay prevents thundering herd.
**Rationale**: Resilient MFE loading; transient failures should not crash the application.

#### API Retry Safety

- [x] `p2` - **ID**: `cpt-hai3-nfr-rel-api-retry`

API plugin retry MUST enforce `maxRetryDepth` (default: 10) to prevent infinite retry loops.

**Threshold**: Maximum 10 retry attempts per request.
**Rationale**: Prevents infinite retry loops from cascading failures.

#### MFE Operation Serialization

- [x] `p1` - **ID**: `cpt-hai3-nfr-rel-serialization`

Concurrent MFE lifecycle operations on the same domain MUST be serialized to prevent state corruption.

**Threshold**: No concurrent load/mount/unmount operations on the same domain.
**Rationale**: Prevents race conditions in extension lifecycle management.

#### Shadow DOM CSS Isolation

- [x] `p1` - **ID**: `cpt-hai3-nfr-sec-shadow-dom`

Each MFE extension MUST render inside a Shadow DOM with `all: initial` host reset for CSS isolation. Shadow roots MUST default to `mode: 'open'`.

**Threshold**: Zero CSS leakage between MFE extensions and host.
**Rationale**: Style isolation prevents visual corruption across boundaries.

#### CSP Blob URL Requirement

- [x] `p1` - **ID**: `cpt-hai3-nfr-sec-csp-blob`

Content Security Policy MUST include `blob:` in `script-src` directive. MFE loading MUST fail explicitly if blob URLs are blocked by CSP.

**Threshold**: Clear error message on CSP violation.
**Rationale**: Deployment environments must be aware of CSP requirements.

#### GTS Type Validation

- [x] `p1` - **ID**: `cpt-hai3-nfr-sec-type-validation`

All MFE action chains MUST pass GTS type system validation before execution.

**Threshold**: Invalid actions rejected with validation error details.
**Rationale**: Prevents malformed data from reaching MFE extensions.

#### Node.js Compatibility

- [x] `p1` - **ID**: `cpt-hai3-nfr-compat-node`

Development environment MUST require Node.js >= 22.0.0, npm >= 10.0.0. Published packages MUST support Node.js >= 18.0.0.

**Threshold**: All packages pass CI on Node 18 and Node 22.
**Rationale**: LTS compatibility for consumers; latest for development.

#### TypeScript Strict Mode

- [x] `p1` - **ID**: `cpt-hai3-nfr-compat-typescript`

TypeScript strict mode MUST be enabled with ALL strict sub-flags. No `any`, no `as unknown as` casts in published code.

**Threshold**: Zero TypeScript strict violations in CI.
**Rationale**: Maximum type safety across the codebase.

#### ESM-First Module Format

- [x] `p1` - **ID**: `cpt-hai3-nfr-compat-esm`

All packages MUST use ESM-first with dual CJS output. `"type": "module"` in all `package.json` files.

**Threshold**: Both `import` and `require` paths resolve correctly.
**Rationale**: Modern module ecosystem compatibility.

#### React 19 Compatibility

- [x] `p1` - **ID**: `cpt-hai3-nfr-compat-react`

React >= 19.2.4, React DOM >= 19.2.4. React Redux >= 8.0.0.

**Threshold**: All hooks and components work with React 19 concurrent features.
**Rationale**: Latest React with ref-as-prop pattern.

#### Zero Cross-Deps at L1

- [x] `p1` - **ID**: `cpt-hai3-nfr-maint-zero-crossdeps`

SDK Layer (L1) packages MUST have ZERO `@gears-frontx/*` dependencies and ZERO React dependencies. Enforced by dependency-cruiser rules.

**Threshold**: `npm run arch:deps:sdk` passes with zero violations.
**Rationale**: SDK packages must be independently consumable.

#### Event-Driven Communication Only

- [x] `p1` - **ID**: `cpt-hai3-nfr-maint-event-driven`

All cross-domain communication MUST use the event bus. No direct slice dispatch from components. No manual state sync or prop drilling.

**Threshold**: Zero direct `dispatch` calls in component files; zero cross-package event bus imports in components.
**Rationale**: Consistent event-driven architecture throughout.

#### Architecture Enforcement

- [x] `p2` - **ID**: `cpt-hai3-nfr-maint-arch-enforcement`

Architecture MUST be verifiable via `npm run arch:check`, `arch:deps`, and `arch:unused`. Dependency-cruiser and Knip MUST enforce layer boundaries and detect unused exports.

**Threshold**: All architecture checks pass in CI.
**Rationale**: Prevents architectural drift over time.

### 6.2 NFR Exclusions

- **Accessibility** (UX-PRD-002): Not applicable at framework level — accessibility is the responsibility of application/screenset UI components and application-level code. Local UI may use Radix UI primitives for accessibility foundations.
- **Safety** (SAFE-PRD-001/002): Not applicable — HAI3 is a client-side UI framework with no physical interaction, medical, or vehicle control capabilities.
- **Regulatory Compliance** (COMPL-PRD-001/002/003): Not applicable — HAI3 does not process PII, financial data, or healthcare data. Applications built with HAI3 may have compliance requirements, but those are application-level concerns.
- **Internationalization** (UX-PRD-003): Addressed as functional requirement `cpt-hai3-fr-sdk-i18n-package` — HAI3 provides the i18n infrastructure; application-level translation content is out of scope.
- **Offline Capability** (UX-PRD-004): Not applicable — HAI3 is designed for always-connected SPA environments.
- **Availability/Recovery** (REL-PRD-001/002): Not applicable — HAI3 is a client-side library, not a hosted service. Availability and recovery are deployment-level concerns.

## 7. Public Library Interfaces

### 7.1 Public API Surface

#### @gears-frontx/state

- [x] `p1` - **ID**: `cpt-hai3-interface-state`

**Type**: TypeScript ES module
**Stability**: stable
**Description**: Event-driven state management with EventBus pub/sub, Redux-backed store, dynamic slice registration, and type-safe module augmentation.
**Breaking Change Policy**: Major version bump required.

#### @gears-frontx/screensets

- [x] `p1` - **ID**: `cpt-hai3-interface-screensets`

**Type**: TypeScript ES module
**Stability**: stable
**Description**: MFE type system, ScreensetsRegistry, MfeHandler, MfeBridge, Shadow DOM utilities, GTS validation plugin, action/property constants.
**Breaking Change Policy**: Major version bump required.

#### @gears-frontx/api

- [x] `p1` - **ID**: `cpt-hai3-interface-api`

**Type**: TypeScript ES module
**Stability**: stable
**Description**: Protocol-agnostic API layer with REST and SSE protocols, plugin chain, mock mode, type guards.
**Breaking Change Policy**: Major version bump required.

#### @gears-frontx/i18n

- [x] `p1` - **ID**: `cpt-hai3-interface-i18n`

**Type**: TypeScript ES module
**Stability**: stable
**Description**: 36-language i18n registry, locale-aware formatters (date, number, currency, collation), RTL support, language metadata.
**Breaking Change Policy**: Major version bump required.

#### @gears-frontx/framework

- [x] `p1` - **ID**: `cpt-hai3-interface-framework`

**Type**: TypeScript ES module
**Stability**: stable
**Description**: Plugin architecture with `createHAI3()` builder, presets, layout domain slices, effect coordination, re-exports all L1 APIs.
**Breaking Change Policy**: Major version bump required.

#### @gears-frontx/react

- [x] `p1` - **ID**: `cpt-hai3-interface-react`

**Type**: TypeScript ES module (React 19+)
**Stability**: stable
**Description**: HAI3Provider, typed hooks, MFE hooks, ExtensionDomainSlot, RefContainerProvider, re-exports all L2 APIs.
**Breaking Change Policy**: Major version bump required.

#### @gears-frontx/studio

- [x] `p2` - **ID**: `cpt-hai3-interface-studio`

**Type**: TypeScript ES module (React 19+)
**Stability**: experimental
**Description**: Dev-only floating overlay with MFE package selector, theme/language/mock controls, persistence, viewport clamping.
**Breaking Change Policy**: Minor version may include breaking changes during experimental phase.

#### @gears-frontx/cli

- [x] `p1` - **ID**: `cpt-hai3-interface-cli`

**Type**: Node.js CLI binary + programmatic API
**Stability**: stable
**Description**: Project scaffolding, code generation, migration runners, AI tool configuration sync.
**Breaking Change Policy**: Major version bump required.

### 7.2 External Integration Contracts

#### MFE Manifest Contract

- [x] `p1` - **ID**: `cpt-hai3-contract-mfe-manifest`

**Direction**: required from MFE packages
**Protocol/Format**: JSON (mfe.json)
**Compatibility**: Manifest schema must match `MfManifest` type from `@gears-frontx/screensets`.
**Description**: Each MFE package provides a manifest declaring remoteEntry, exposedModules, sharedDependencies with optional chunkPath.

#### Module Federation Runtime

- [x] `p2` - **ID**: `cpt-hai3-contract-federation-runtime`

**Direction**: required from build system
**Protocol/Format**: `@originjs/vite-plugin-federation` runtime
**Compatibility**: Compatible with vite-plugin-federation v1.4.x.
**Description**: Federation runtime's `importShared()` resolves from `globalThis.__federation_shared__`.

## 8. Use Cases

#### MFE Extension Loading

- [x] `p1` - **ID**: `cpt-hai3-usecase-mfe-load`

**Actor**: `cpt-hai3-actor-host-app`

**Preconditions**:
- HAI3 app initialized with `microfrontends()` plugin
- Extension domain registered with shared properties and actions

**Main Flow**:
1. Host dispatches `loadExtension` action with MFE manifest URL
2. MfeHandlerMF fetches manifest and shared dependency source text
3. Handler constructs blob URL share scope and evaluates exposed module
4. Handler returns lifecycle module (mount/unmount)
5. Host dispatches `mountExtension` to render in Shadow DOM slot

**Postconditions**:
- Extension rendered in Shadow DOM with CSS isolation
- Shared properties (theme, language) propagated
- Action chain communication available

**Alternative Flows**:
- **Manifest fetch fails**: MfeLoadError thrown; host can retry with exponential backoff
- **GTS validation fails**: Extension not mounted; error logged with validation details

#### Screenset Scaffolding

- [x] `p2` - **ID**: `cpt-hai3-usecase-scaffold`

**Actor**: `cpt-hai3-actor-developer`

**Preconditions**:
- HAI3 project exists with `@gears-frontx/cli` installed

**Main Flow**:
1. Developer runs `hai3 scaffold screenset my-feature`
2. CLI copies screenset template to `src/screensets/my-feature/`
3. Template includes: screens, translations, API service stubs, actions, effects
4. Developer modifies generated code to implement business logic

**Postconditions**:
- Self-contained screenset folder with working demo screens
- Translation namespaces derived from screenset/screen IDs
- API service stubs ready for implementation

**Alternative Flows**:
- **Directory exists**: CLI prompts for `--force` flag to overwrite

## 9. Acceptance Criteria

- [x] All published workspace packages build successfully in layer dependency order
- [x] `npm run arch:check` passes with zero violations (dependency-cruiser)
- [x] `npm run arch:unused` passes with zero violations (Knip)
- [x] SDK packages (state, screensets, api, i18n) have zero `@gears-frontx/*` dependencies
- [x] MFE blob URL isolation produces independent module evaluations per load
- [x] Shared property updates propagate only to domains that declare the property
- [x] GTS validation rejects invalid shared property values before propagation
- [x] All formatters return `''` for invalid inputs without throwing
- [x] Studio panel is excluded from production builds via tree-shaking
- [x] CLI scaffolds functional project with `hai3 create` + `hai3 scaffold layout`

## 10. Dependencies

| Dependency | Description | Criticality |
|------------|-------------|-------------|
| `@reduxjs/toolkit` >=2.0.0 | Store, slices, Redux internals for @gears-frontx/state | p1 |
| `axios` >=1.0.0 | HTTP REST client for @gears-frontx/api | p1 |
| `react` ^19.2.4 | UI rendering for @gears-frontx/react, studio | p1 |
| `react-dom` ^19.2.4 | DOM rendering | p1 |
| `react-redux` >=8.0.0 | React-Redux bindings for @gears-frontx/react | p1 |
| `@globaltypesystem/gts-ts` ^0.3.0 | GTS type validation for @gears-frontx/screensets | p1 |
| `vite` 6.4.1 | Build tooling and dev server | p1 |
| `@originjs/vite-plugin-federation` ^1.4.1 | Module Federation for MFEs | p1 |
| `tsup` ^8.0.0 | Package bundling (ESM/CJS dual output) | p2 |
| `tailwindcss` ^3.4.1 | Utility CSS for local UI | p2 |
| `commander` ^12.1.0 | CLI argument parsing for @gears-frontx/cli | p2 |
| Radix UI primitives (20+ packages) | Accessible UI for local UI | p2 |
| `recharts` | Chart visualization for local UI | p3 |
| `sonner` | Toast notifications for local UI | p3 |

## 11. Assumptions

- Applications are client-side SPAs served from a static host or CDN; no SSR infrastructure assumed
- Modern evergreen browsers (Chrome, Firefox, Safari, Edge) with ES2020 target; no IE11 or legacy polyfills
- Development requires npm >= 10.0.0 with workspace support
- Development environment requires Node.js 22+; published packages support Node.js 18+ at runtime
- MFE remote entries are fetchable via `fetch()`, requiring same-origin hosting or proper CORS headers
- Deployment environments allow `blob:` in CSP `script-src` for MFE isolation
- Both host app and MFE packages use Vite with `@originjs/vite-plugin-federation`
- Host application uses React 19; MFEs may use any framework implementing the lifecycle interface
- Package version 0.4.0-alpha.0 — backward-incompatible changes are expected
- Lodash is required for non-trivial object and array operations (per project guidelines)

## 12. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Blob URL memory accumulation in long sessions | Memory leak from non-revoked blob URLs | Browser cleans up on page unload; typical SPA lifecycle is bounded |
| Module Federation plugin limitations | `@originjs/vite-plugin-federation` updates may break handler | Custom externalize plugin and source text rewriting bypass federation runtime limitations |
| CSP policy conflicts with blob: URLs | Enterprise deployments may reject blob URLs | Document CSP requirement; provide MfeHandler extension point for alternatives |
| Race conditions in concurrent MFE operations | State corruption from interleaved lifecycle operations | Domain-level operation serialization; per-load LoadBlobState isolation |
| Memory leaks from unreleased event subscriptions | EventSource, EventBus, axios connections not cleaned up | cleanup() methods on protocols, destroy() on plugins, unsubscribe() on subscriptions |
| Large change surface for breaking changes | Alpha status means API changes are expected | CLI migration runners automate codemod transformations |
| Infinite retry loops | API/MFE retry could loop indefinitely | maxRetryDepth (default: 10) in RestProtocol; retries config (default: 2) in MfeHandlerMF |
| Single Module Federation implementation lock-in | Only vite-plugin-federation supported | MfeHandler is abstract; custom handlers pluggable via microfrontends config |
