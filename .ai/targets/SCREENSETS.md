<!-- @standalone -->
# Screensets Guidelines

## AI WORKFLOW (REQUIRED)
1) Summarize 3-5 rules from this file before proposing changes.
2) REQUIRED: When user provides Figma link, run `npm run check:mcp` first to verify MCP availability.
3) STOP if you add manual styling, custom state management, direct slice imports, or hardcode screenset names.

## SCOPE
- Applies to MFE screenset packages under src/mfe_packages/** (primary).
- Legacy: src/screensets/** (no screensets exist here after MFE conversion).
- MFE packages may define local actions, events, slices, effects, API services, and localization.

## CRITICAL RULES
- REQUIRED: Use the configured UI kit components; manual styling only in components/ui/.
- Data flow must follow EVENTS.md.
- State management must follow @gears-frontx/state Redux+Flux pattern.
- Screensets are isolated; no hardcoded screenset names in shared code.
- Registry imports only the screenset root file.
- No direct slice imports; use @gears-frontx/react hooks or local actions.

## STATE MANAGEMENT RULES
- REQUIRED: Export slice object (not just reducer) as default from slice files.
- REQUIRED: registerSlice(sliceObject, initEffects) passes slice object directly.
- REQUIRED: Split screenset into domains (threads, messages, settings, etc).
- REQUIRED: Domain-specific folders: slices/, actions/, events/, effects/.
- REQUIRED: Events split into domain files with local DOMAIN_ID.
- REQUIRED: Effects split into domain files; each slice registers its own effects.
- FORBIDDEN: Object.defineProperty on reducers.
- FORBIDDEN: Exporting only reducer from slice files.
- FORBIDDEN: Coordinator effects files.
- FORBIDDEN: Monolithic slice/events/effects files.
- FORBIDDEN: Barrel exports in events/ or effects/.
- REQUIRED: RootState augmentation in screenset store files.
- FORBIDDEN: Zustand-style stores, custom stores, manual subscribe/notify.
- DETECT: grep -rn "class.*Store\\|subscribe.*listener" src/screensets/*/
- DETECT: grep -rn "events/index\\|effects/index" src/screensets
- DETECT: grep -rn "chatEffects\\|demoEffects" src/screensets
- DETECT: grep -rn "Object\\.defineProperty.*reducer" src/screensets

## MFE STATE MANAGEMENT
- REQUIRED: Create FrontX app via `createGears FrontX().use(effects()).use(queryCacheShared()).use(mock()).build()` from `@gears-frontx/react`. The host owns the shared QueryClient via `queryCache()`; MFEs must join it with `queryCacheShared()` so query hooks resolve the same cache (see `src/mfe_packages/_blank-mfe/src/init.ts`).
- REQUIRED: Register API services BEFORE .build() — mock plugin syncs during build, services must exist.
- REQUIRED: Register slices AFTER .build() — registerSlice() needs the store created by build.
- REQUIRED: Wrap React tree in <Gears FrontXProvider app={mfeApp}> from @gears-frontx/react.
- REQUIRED: registerSlice() and createSlice() from @gears-frontx/react for slice management.
- FORBIDDEN: Direct `useQueryClient()` in MFE screen code; use `@gears-frontx/react` query hooks and follow `.ai/targets/REACT.md` for restricted cache access.
- FORBIDDEN: `queryCache()`, `createGears FrontXApp()`, or `QueryClientProvider` in MFE bootstrap — the host configures the shared query runtime; MFE init only joins via `queryCacheShared()`.
- REQUIRED: Shared init.ts module for idempotent MFE bootstrap (module-level side effect).
- REQUIRED: init.ts ordering: `apiRegistry.register()` → `apiRegistry.initialize()` → `createGears FrontX().use(effects()).use(queryCacheShared()).use(mock()).build()` → `registerSlice()` (when slices exist).
- REQUIRED: Module augmentation for RootState on @gears-frontx/react (not @gears-frontx/state).
- FORBIDDEN: Direct react-redux, redux, or @reduxjs/toolkit imports in MFE code.
- FORBIDDEN: createGears FrontXApp() or full preset in MFE (heavyweight, not needed).

## DRAFT ENTITY PATTERN
- REQUIRED: Create draft entities locally before backend save.
- REQUIRED: Use isDraft: true and temporary IDs.
- REQUIRED: Replace draft with persisted entity from backend.
- REQUIRED: Entity data must not contain i18n strings; UI handles translation.
- FORBIDDEN: Hardcoded i18n values in entity data.
- DETECT: grep -rn "t(.*new_.*)" src/screensets/*/

## LOCALIZATION RULES
- REQUIRED: Two-tier system: screenset-level and screen-level translations.
- REQUIRED: Screenset-level: localization: TranslationLoader in config.
- REQUIRED: Screen-level: useScreenTranslations(screensetId, screenId, loader).
- REQUIRED: Use I18nRegistry.createLoader with full language map.
- REQUIRED: Namespaces: "screenset.id:key" (screenset), "screen.screenset.screen:key" (screen).
- REQUIRED: Place translations in local i18n folders for screenset and screen.
- REQUIRED: Wrap translated text with <TextLoader>.
- FORBIDDEN: Hardcoded strings or partial language sets.
- DETECT: grep -R "['\"] [A-Za-z].* " src/screensets

## MFE LOCALIZATION RULES
- REQUIRED: Subscribe to language domain property via bridge.subscribeToProperty(Gears FrontX_SHARED_PROPERTY_LANGUAGE, callback).
- REQUIRED: Load translations from MFE-local files using import.meta.glob pattern.
- REQUIRED: Place translations in local i18n folders (src/mfe_packages/*/src/screens/*/i18n/).
- FORBIDDEN: I18nRegistry.createLoader (host-level API, not available in MFEs).
- FORBIDDEN: useScreenTranslations hook from @gears-frontx/react (host-level hook with registry dependency).
- NOTE: MFEs use the shared useScreenTranslations hook in their own shared/ directory (bridge-based).

## API SERVICE RULES
- REQUIRED: Screenset-local API services in src/screensets/*/api/.
- REQUIRED: Unique domain constant per screenset.
- REQUIRED: Import API service in screenset root for registration.
- REQUIRED: Actions import from local api folder.
- FORBIDDEN: Centralized src/api/ directory.
- FORBIDDEN: Sharing API services between screensets.
- DETECT: grep -rn "@/api/services" src/

## MFE API SERVICE RULES
- REQUIRED: MFE-local API services in src/mfe_packages/*/src/api/.
- REQUIRED: Services extend BaseApiService from @gears-frontx/react.
- REQUIRED: Register with MFE's own apiRegistry instance (from @gears-frontx/react).
- REQUIRED: Mock plugins via this.registerPlugin() in service constructor.
- REQUIRED: Each MFE fetches its own data independently (Independent Data Fetching).
- FORBIDDEN: Importing API services from host src/app/api/ (cross-boundary violation).
- FORBIDDEN: Proxying data from MFE to host or vice versa.
- NOTE: Duplicate services across host and MFE are intentional architectural choice.

## ICON RULES
- REQUIRED: Menu item icons use Iconify string IDs (e.g., "lucide:home", "lucide:globe").
- REQUIRED: Icon strings in menu config (e.g., menuItem: { icon: "lucide:palette" }).
- FORBIDDEN: registerIcons() calls or React.ComponentType in MenuItem.icon field.
- FORBIDDEN: Storing React components as icons (causes Redux serialization warnings).

## UI KIT DISCOVERY (REQUIRED)
- REQUIRED: Read `frontx.config.json` at project root to find `uikit` value.
- If `uikit` is `"shadcn"`: use local `components/ui/` (shadcn components already scaffolded).
- If `uikit` is `"none"`: no UI library; create all components locally in components/ui/.
- If `uikit` is any other value (e.g., `"@mui/material"`, `"antd"`): it is a third-party UI library.
  - REQUIRED: Read the package's exports from `node_modules/<package>/` to discover available components.
  - REQUIRED: Import and use the library's components directly in screens and composites.
  - REQUIRED: Only create local components/ui/ components for what the library does not provide.
  - REQUIRED: Follow the library's documented patterns (e.g., MUI's `<TextField>`, Ant Design's `<Input>`).

## SCREENSET UI KIT RULES
- REQUIRED: Prioritize the configured UI kit components; create local only if missing.
- REQUIRED: components/ui/ for base UI primitives (shadcn or custom).
- REQUIRED: components/ for shared composites used across screens.
- FORBIDDEN: @gears-frontx/state or @gears-frontx/framework imports in components/ui/ (UI only).
- REQUIRED: Inline styles allowed ONLY in components/ui/; composites use theme tokens.

## COMPONENT PLACEMENT RULES
- REQUIRED: Decompose screens into components BEFORE writing screen file.
- REQUIRED: Screen files orchestrate components only.
- FORBIDDEN: Inline component definitions in *Screen.tsx files.
- FORBIDDEN: Inline data arrays; use API services per EVENTS.md.
- REQUIRED: Presentational components (value/onChange only) in components/ui/ or screens/{screen}/components/.
- REQUIRED: Shared screenset components in screensets/{name}/components/.
- REQUIRED: Screen-local components in screens/{screen}/components/.
- DETECT: eslint local/screen-inline-components

## MFE ARCHITECTURE (Phase 12 Integration)

### Type System Plugin Abstraction
- REQUIRED: TypeSystemPlugin injected at ScreensetsRegistry initialization.
- REQUIRED: GTS plugin (`gtsPlugin`) is the default Type System implementation.
- REQUIRED: Type IDs are opaque strings - call plugin methods for metadata.
- REQUIRED: All first-class schemas built into GTS plugin (no registration needed).
- FORBIDDEN: Generating type IDs at runtime - all type IDs are string constants.
- FORBIDDEN: Direct Ajv dependency - gts-ts uses Ajv internally.

### MFE Registry and Runtime
- REQUIRED: ScreensetsRegistry is the single entry point for MFE operations.
- REQUIRED: Extensions and domains registered dynamically at runtime (not at init).
- REQUIRED: Contract validation uses plugin.validateInstance() after plugin.register().
- REQUIRED: Extension type validation via plugin.isTypeOf() for type hierarchy.
- REQUIRED: ActionsChainsMediator handles all action chain execution.
- FORBIDDEN: Direct access to internal coordinators or mediators.

### MFE Handler and Loading
- REQUIRED: MfeHandler abstract class for polymorphic entry type handling.
- REQUIRED: Handlers use plugin.isTypeOf() for canHandle() type matching.
- REQUIRED: MfeBridgeFactory creates ChildMfeBridge instances.
- REQUIRED: MfeHandlerMF handles Module Federation entry types (MfeEntryMF).
- REQUIRED: Manifest resolution internal to MfeHandlerMF (not public API).
- FORBIDDEN: Exposing MfManifest registration publicly.

### Actions Chain Execution
- REQUIRED: ActionsChain contains Action instances (not type ID references).
- REQUIRED: Action uses `type` field as GTS entity ID (not synthetic IDs).
- REQUIRED: Timeout resolution: action.timeout ?? domain.defaultActionTimeout.
- REQUIRED: Timeout triggers fallback chain (same as any other failure).
- REQUIRED: ChainExecutionOptions only accepts chainTimeout (chain-level).
- FORBIDDEN: Action-level execution options in executeActionsChain().

### Lifecycle and Coordination
- REQUIRED: Lifecycle stages defined in domain (lifecycleStages, extensionsLifecycleStages).
- REQUIRED: LifecycleHook binds stage to actions_chain for execution.
- REQUIRED: RuntimeCoordinator abstract class for coordination (DI pattern).
- REQUIRED: WeakMapRuntimeCoordinator concrete implementation (not exported).
- REQUIRED: Coordination is internal - MFEs never see coordinator directly.
- FORBIDDEN: Exposing coordination internals to MFE code.

### Documentation Resources
- Vendor guide: `packages/screensets/docs/mfe/vendor-guide.md`
- Plugin guide: `packages/screensets/docs/mfe/plugin-interface.md`
- GTS usage: `packages/screensets/docs/mfe/gts-plugin.md`

## MFE BUILD CONFIGURATION
- REQUIRED: `build.modulePreload: false` in every MFE vite.config.ts. Vite's modulePreload injects a `__vitePreload` helper that resolves chunk URLs against the page origin (host), not the MFE server origin, causing 404s in cross-origin MFE loading.
- REQUIRED: `build.target: 'esnext'` for top-level await support (federation runtime uses it).
- NOTE: `build.cssCodeSplit` may remain enabled; `MfeHandlerMF` reads the remote's CSS metadata and injects emitted styles into the mount target before lifecycle mount.
- REQUIRED: Register `@originjs/vite-plugin-federation` (`federation()`) and `frontxMfeExternalize({ shared })` from `src/mfe_packages/shared/vite-plugin-frontx-externalize.ts` with the **same** `shared` dependency list. Federation only rewrites expose entries; the externalize plugin rewrites imports in code-split chunks so shared packages load via `importShared()`.
- REFERENCE: See `src/mfe_packages/_blank-mfe/vite.config.ts` for canonical MFE vite configuration.

## MFE LIFECYCLE ARCHITECTURE
- REQUIRED: MFE entries are lifecycle files exporting MfeEntryLifecycle (mount/unmount).
- REQUIRED: ThemeAwareReactLifecycle abstract base class for React-based MFE entries.
- REQUIRED: Shared init.ts module imported by base class for bootstrap side effect.
- REQUIRED: Flux directory structure: api/, actions/, events/, effects/, slices/, init.ts.
- REQUIRED: Event naming: mfe/<domain>/<eventName> (past tense for all events).
- REQUIRED: Module augmentation for EventPayloadMap on @gears-frontx/react (not @gears-frontx/state).
- FORBIDDEN: screensetRegistry (removed, replaced by MFE extension registration).
- FORBIDDEN: useNavigation hook (removed, replaced by MFE actions).
- FORBIDDEN: navigateToScreen (removed, replaced by mount_ext actions).

## PRE-DIFF CHECKLIST
- [ ] UI kit discovered from frontx.config.json; third-party library components used where available.
- [ ] Local components/ui/ only for what the configured UI kit does not provide (inline styles in components/ui/ only).
- [ ] Slices use registerSlice with RootState augmentation.
- [ ] No direct slice imports; no barrel exports in events/ or effects/.
- [ ] Icons exported; API service isolated; events/effects split by domain.
- [ ] All text uses t(); loaders use I18nRegistry.createLoader.
- [ ] useScreenTranslations for screen-level; namespaces: screenset.id, screen.screenset.screen.
- [ ] No inline components or data arrays in *Screen.tsx.
- [ ] MFE integration uses TypeSystemPlugin abstraction (gtsPlugin default).
- [ ] Type IDs are opaque - call plugin.parseTypeId() for metadata.
- [ ] Contract validation via plugin.validateInstance() after plugin.register().
- [ ] MFE uses `createGears FrontX().use(effects()).use(queryCacheShared()).use(mock()).build()` + Gears FrontXProvider (no direct Redux; no `queryCache()` in MFE init).
- [ ] MFE API services are local (not imported from host).
- [ ] MFE events use mfe/ prefix convention.
- [ ] MFE init.ts creates app, registers slices, registers API services.
- [ ] MFE vite.config matches canonical setup: `modulePreload: false`, `target: 'esnext'`, `federation()` + `frontxMfeExternalize` with identical `shared` arrays.
