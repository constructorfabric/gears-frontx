# @gears-frontx/screensets

Pure TypeScript contracts and MFE (Microfrontend) runtime for FrontX applications.

## SDK Layer

This package is part of the **SDK Layer (L1)** - it has **ZERO dependencies** and can be used independently. It contains TypeScript types, abstract classes, and the MFE-enabled registry implementation.

## What This Package Contains

| Export | Description |
|--------|-------------|
| `ScreensetsRegistry` | Abstract class: MFE-enabled registry for domain and extension management |
| `ScreensetsRegistryFactory` | Factory interface for creating registry instances |
| `screensetsRegistryFactory` | Default factory implementation |
| `Extension` | Interface: Extension definition (screen extensions, popups, etc.) |
| `ScreenExtension` | Type: Screen-specific extension (derived from `Extension`) |
| `ExtensionDomain` | Interface: Domain definition (screen, sidebar, popup, overlay) |
| `MfeHandler` | Abstract class: Handler for MFE lifecycle (load, mount, unmount) |
| `MfeBridgeFactory` | Abstract class: Factory for creating MFE bridges |
| `LayoutDomain` | Enum: Layout domain identifiers (header, footer, menu, sidebar, screen, popup, overlay) |
| Action/Property Constants | `HAI3_ACTION_*`, `HAI3_SHARED_PROPERTY_*` |
| `TypeSystemPlugin` | Interface: Type validation plugin (e.g., GTS) |
| Shadow DOM Utilities | `createShadowRoot`, `injectCssVariables` |

## What This Package Does NOT Contain

- **NO concrete MFE implementations** - Use `MfeHandlerMF` from `@gears-frontx/screensets/mfe/handler` subpath
- **NO GTS plugin in main export** - Import from `@gears-frontx/screensets/plugins/gts` to avoid pulling @globaltypesystem/gts-ts
- **NO translation types** - Use `@gears-frontx/i18n` for translation types
- **NO Redux slices** - Layout state management is in `@gears-frontx/framework`
- **NO dependencies** - Pure TypeScript, zero runtime dependencies

## MFE Architecture

FrontX uses a microfrontend architecture where extensions (screens, popups, sidebars) are dynamically registered, loaded, and mounted into layout domains.

### ScreensetsRegistry

The MFE-enabled registry manages domains and extensions with full lifecycle support:

```typescript
import {
  ScreensetsRegistry, ExtensionDomain, Extension,
  HAI3_ACTION_LOAD_EXT, HAI3_ACTION_MOUNT_EXT, HAI3_ACTION_UNMOUNT_EXT,
} from '@gears-frontx/screensets';

// Register domain (requires containerProvider) and extension
registry.registerDomain(screenDomain, containerProvider);
await registry.registerExtension(homeExtension);

// Load, mount, unmount via executeActionsChain (the public API)
await registry.executeActionsChain({
  action: { type: HAI3_ACTION_LOAD_EXT, target: screenDomainId, payload: { subject: 'ext-id' } }
});
await registry.executeActionsChain({
  action: { type: HAI3_ACTION_MOUNT_EXT, target: screenDomainId, payload: { subject: 'ext-id' } }
});
await registry.executeActionsChain({
  action: { type: HAI3_ACTION_UNMOUNT_EXT, target: screenDomainId, payload: { subject: 'ext-id' } }
});
```

**NOTE**: `loadExtension()`, `mountExtension()`, `unmountExtension()` are NOT public methods on `ScreensetsRegistry`. They are internal to `MountManager`. All lifecycle operations go through `executeActionsChain()` with the appropriate `HAI3_ACTION_*` type.

### Extension Lifecycle

Extensions follow a strict lifecycle managed by the registry via actions chains:

1. **Register**: `registry.registerExtension(extension)` -- add extension definition
2. **Load**: `executeActionsChain({ action: { type: HAI3_ACTION_LOAD_EXT, ... } })` -- fetch and initialize code
3. **Mount**: `executeActionsChain({ action: { type: HAI3_ACTION_MOUNT_EXT, ... } })` -- render into Shadow DOM
4. **Unmount**: `executeActionsChain({ action: { type: HAI3_ACTION_UNMOUNT_EXT, ... } })` -- remove from domain
5. **Unregister**: `registry.unregisterExtension(extensionId)` -- remove extension definition

Each stage supports lifecycle hooks and actions chains with success/fallback branching.

### MFE Handler

The `MfeHandler` abstract class defines the interface for loading and executing MFE entry points:

```typescript
import { MfeHandler, MfeEntry } from '@gears-frontx/screensets';

// Concrete implementation (typically internal or from framework)
class MyMfeHandler extends MfeHandler {
  async load(url: string): Promise<MfeEntry> {
    // Load MFE entry point from URL
    const module = await import(url);
    return module.default;
  }
}
```

### MFE Bridge

Bridges provide communication between parent (host) and child (MFE) applications:

```typescript
import { ParentMfeBridge, ChildMfeBridge } from '@gears-frontx/screensets';

// Parent bridge (in host app) - obtained via registry.getParentBridge(extensionId)
// ParentMfeBridge has:
//   readonly instanceId: string
//   dispose(): void

// Child bridge (in MFE) - passed to lifecycle mount(container, bridge)
// ChildMfeBridge has:
//   readonly domainId: string
//   readonly instanceId: string
//   executeActionsChain(chain: ActionsChain): Promise<void>
//   subscribeToProperty(propertyTypeId: string, callback): () => void
//   getProperty(propertyTypeId: string): SharedProperty | undefined

// Example: child MFE executes an actions chain
await bridge.executeActionsChain({
  action: { type: HAI3_ACTION_MOUNT_EXT, target: 'screen', payload: { subject: 'other' } }
});

// Example: child MFE subscribes to theme changes
const unsubscribe = bridge.subscribeToProperty(HAI3_SHARED_PROPERTY_THEME, (value) => {
  console.log('Theme changed:', value);
});

// Example: child MFE reads current theme
const theme = bridge.getProperty(HAI3_SHARED_PROPERTY_THEME);
```

## Action Constants

FrontX defines standard actions for extension lifecycle:

```typescript
import {
  HAI3_ACTION_LOAD_EXT,
  HAI3_ACTION_MOUNT_EXT,
  HAI3_ACTION_UNMOUNT_EXT,
} from '@gears-frontx/screensets';

// Action IDs
HAI3_ACTION_LOAD_EXT     // 'gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.load_ext.v1~'
HAI3_ACTION_MOUNT_EXT    // 'gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.mount_ext.v1~'
HAI3_ACTION_UNMOUNT_EXT  // 'gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.unmount_ext.v1~'
```

## Shared Property Constants

FrontX defines standard shared properties for cross-MFE communication:

```typescript
import {
  HAI3_SHARED_PROPERTY_THEME,
  HAI3_SHARED_PROPERTY_LANGUAGE,
} from '@gears-frontx/screensets';

// Property IDs
HAI3_SHARED_PROPERTY_THEME    // 'gts.hai3.mfes.comm.shared_property.v1~hai3.mfes.comm.theme.v1~'
HAI3_SHARED_PROPERTY_LANGUAGE // 'gts.hai3.mfes.comm.shared_property.v1~hai3.mfes.comm.language.v1~'
```

## Layout Domains

FrontX defines 7 layout domains that extensions can target:

| Domain | Description |
|--------|-------------|
| `header` | Top navigation bar |
| `footer` | Bottom bar |
| `menu` | Side navigation menu |
| `sidebar` | Collapsible side panel |
| `screen` | Main content area |
| `popup` | Modal dialogs |
| `overlay` | Full-screen overlays |

```typescript
import { LayoutDomain } from '@gears-frontx/screensets';

// Use in domain definitions
const visibleDomains = [LayoutDomain.Header, LayoutDomain.Menu, LayoutDomain.Screen];
```

## Type System Plugin

The `TypeSystemPlugin` interface enables runtime type validation:

```typescript
import { TypeSystemPlugin } from '@gears-frontx/screensets';

const myTypeSystem: TypeSystemPlugin = {
  validate(schema, data) {
    // Validate data against schema
    return { valid: true };
  },
};
```

FrontX provides a GTS (Global Type System) plugin for JSON Schema validation. Import from the subpath to avoid dependency bloat:

```typescript
import { gtsPlugin } from '@gears-frontx/screensets/plugins/gts';
```

## Shadow DOM Utilities

Utilities for creating isolated MFE rendering contexts:

```typescript
import { createShadowRoot, injectCssVariables } from '@gears-frontx/screensets';

// Create shadow root
const shadowRoot = createShadowRoot(container, { mode: 'open' });

// Inject CSS variables into shadow DOM
injectCssVariables(shadowRoot, {
  '--primary-color': '#007bff',
  '--font-family': 'Arial, sans-serif',
});
```

## GTS Package Queries

Query methods for discovering registered GTS packages from extensions.

### getRegisteredPackages()

Returns all registered GTS packages in discovery order:

```typescript
const packages = registry.getRegisteredPackages();
// Returns: ['hai3.demo', 'hai3.other', ...]
```

### getExtensionsForPackage(packageId)

Returns all extensions belonging to a specific GTS package:

```typescript
const demoExtensions = registry.getExtensionsForPackage('hai3.demo');
// Returns: [homeExtension, profileExtension, ...]
```

### extractGtsPackage(entityId)

Utility function to extract the GTS package from any entity ID:

```typescript
import { extractGtsPackage } from '@gears-frontx/screensets';

const pkg = extractGtsPackage('gts.hai3.mfes.ext.extension.v1~hai3.screensets.layout.screen.v1~hai3.demo.screens.home.v1');
// Returns: 'hai3.demo'
```

Packages are tracked automatically when extensions are registered. There is no explicit package registration. When the last extension for a package is unregistered, the package is removed from the list.

## Key Rules

1. **This package is contracts + runtime** - Abstract classes, interfaces, and MFE-enabled registry
2. **ZERO dependencies** - Keep it pure TypeScript, no @gears-frontx inter-dependencies
3. **Registry is MFE-enabled** - Manages domains, extensions, lifecycle, and coordination
4. **Concrete implementations are internal** - Use framework re-exports or subpath imports
5. **GTS plugin is opt-in** - Import from `@gears-frontx/screensets/plugins/gts` to avoid dependency bloat
6. **Import layout state from @gears-frontx/framework** - HeaderState, MenuState, slices are there

## Package Relationship

```
@gears-frontx/screensets (SDK L1)           @gears-frontx/framework (L2)
├── Contracts (types, abstract)  ─> ├── Re-exports contracts
├── ScreensetsRegistry (MFE)     ─> ├── Re-exports registry
├── MfeHandler (abstract)        ─> ├── MfeHandlerMF (concrete)
├── MfeBridgeFactory (abstract)  ─> ├── Concrete bridge factory
└── ZERO dependencies               ├── Layout state shapes
                                    ├── Layout slices
                                    ├── MFE plugin (microfrontends())
                                    └── i18nRegistry (from @gears-frontx/i18n)
```

## Migration from Legacy Screensets

The legacy screenset API (`screensetRegistry`, `ScreensetDefinition`, `ScreensetCategory`) has been removed. FrontX now uses the MFE architecture exclusively:

- **OLD**: `screensetRegistry.register(screensetDefinition)`
- **NEW**: `registry.registerDomain(domain, containerProvider)` + `await registry.registerExtension(extension)`

- **OLD**: `navigateToScreen({ screensetId, screenId })`
- **NEW**: `mountExtension({ extensionId, domainId, container })`

See the MFE migration guide in the project documentation for detailed migration steps.
