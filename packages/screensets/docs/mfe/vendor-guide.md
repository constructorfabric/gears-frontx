# MFE Vendor Development Guide

This guide explains how third-party vendors can develop microfrontend (MFE) extensions for FrontX applications.

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Getting Started](#getting-started)
4. [Defining Your MFE Entry](#defining-your-mfe-entry)
5. [Creating Extensions](#creating-extensions)
6. [Actions and Communication](#actions-and-communication)
7. [Lifecycle Management](#lifecycle-management)
8. [Dynamic Registration](#dynamic-registration)
9. [Best Practices](#best-practices)

## Overview

FrontX's MFE system enables vendors to create extensions that integrate into host applications through well-defined contracts. Key features:

- **Framework Agnostic**: MFEs can use any UI framework (React, Vue, Angular, Svelte, etc.)
- **Instance-Level Isolation**: Each MFE instance has its own runtime and state (default handler)
- **Type-Safe Contracts**: All interactions validated via GTS Type System
- **Dynamic Registration**: Extensions can be registered at any time during runtime
- **Hierarchical Composition**: MFEs can define their own domains for nested extensions

## Core Concepts

### Type System Plugin

FrontX uses a pluggable Type System abstraction. The default implementation is GTS (`@globaltypesystem/gts-ts`). All type IDs are opaque strings - the plugin handles parsing and validation.

**Key Principle**: When you need metadata about a type ID, call `plugin.parseTypeId()`, `plugin.getAttribute()`, or other plugin methods directly.

### GTS Type ID Format

```
gts.<vendor>.<package>.<namespace>.<type>.v<MAJOR>[.<MINOR>]~
```

**Schema IDs** end with `~`:
```
gts.frontx.mfes.mfe.entry.v1~
```

**Instance IDs** do NOT end with `~`:
```
gts.frontx.mfes.mfe.entry.v1~acme.analytics.mfe.chart.v1
```

### Contract Matching

For an MFE to mount in a domain, three rules must ALL be true:

1. `entry.requiredProperties ⊆ domain.sharedProperties`
2. `entry.actions ⊆ domain.extensionsActions`
3. `domain.actions ⊆ entry.domainActions`

## Getting Started

### 1. Install Dependencies

```bash
npm install @gears-frontx/screensets @globaltypesystem/gts-ts
```

### 2. Import Core Types

```typescript
import type {
  MfeEntry,
  MfeEntryMF,
  MfeEntryLifecycle,
  Extension,
  ExtensionDomain,
  Action,
  ActionsChain,
  ChildMfeBridge,
} from '@gears-frontx/screensets';
import { gtsPlugin } from '@gears-frontx/screensets/plugins/gts';
```

### 3. Understand the Entry Type Hierarchy

```
MfeEntry (abstract base)
  ├─ MfeEntryMF (Module Federation)
  └─ MfeEntryAcme (your custom entry type)
```

## Defining Your MFE Entry

### Basic MFE Entry (Pure Contract)

```typescript
import type { MfeEntry } from '@gears-frontx/screensets';

const myEntry: MfeEntry = {
  // Instance ID (does NOT end with ~)
  id: 'gts.frontx.mfes.mfe.entry.v1~acme.analytics.mfe.chart.v1',

  // Properties this MFE requires from the domain
  requiredProperties: [
    'gts.frontx.mfes.comm.shared_property.v1~acme.analytics.theme.v1',
  ],

  // Properties this MFE optionally uses
  optionalProperties: [
    'gts.frontx.mfes.comm.shared_property.v1~acme.analytics.user_context.v1',
  ],

  // Actions this MFE can send to the domain
  actions: [
    'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.data_ready.v1',
  ],

  // Actions this MFE can receive from the domain
  domainActions: [
    'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.refresh.v1',
  ],
};
```

### Module Federation Entry (MfeEntryMF)

For Module Federation deployments, use `MfeEntryMF` which extends `MfeEntry` with manifest info:

```typescript
import type { MfeEntryMF, MfManifest } from '@gears-frontx/screensets';

// Define the manifest (can be inline or referenced)
// MfManifest is enriched at build time by the frontx-mf-gts plugin.
// Shared deps are derived automatically from rollupOptions.external.
const manifest: MfManifest = {
  id: 'gts.frontx.mfes.mfe.mf_manifest.v1~acme.analytics.manifest.v1',
  name: 'analyticsWidget',
  metaData: {
    name: 'analyticsWidget',
    type: 'app',
    buildInfo: { buildVersion: '1.0.0', buildName: 'analyticsWidget' },
    remoteEntry: { name: 'remoteEntry.js', path: '', type: 'module' },
    globalName: 'analyticsWidget',
    publicPath: 'https://cdn.acme.com/analytics-mfe/',
  },
  shared: [
    { name: 'react', version: '19.2.4', chunkPath: 'shared/react.js', unwrapKey: null },
    { name: 'react-dom', version: '19.2.4', chunkPath: 'shared/react-dom.js', unwrapKey: null },
  ],
};

const mfEntry: MfeEntryMF = {
  // All fields from MfeEntry
  id: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.analytics.mfe.chart.v1',
  requiredProperties: [...],
  optionalProperties: [...],
  actions: [...],
  domainActions: [...],

  // Module Federation specific fields
  manifest: manifest.id, // Can be manifest ID reference or inline manifest object
  exposedModule: './ChartWidget',
};
```

## Creating Extensions

An Extension binds an MFE Entry to a Domain:

```typescript
import type { Extension } from '@gears-frontx/screensets';

const myExtension: Extension = {
  // Instance ID (does NOT end with ~)
  id: 'gts.frontx.mfes.ext.extension.v1~acme.analytics.extension.v1',

  // Domain this extension mounts in
  domain: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.sidebar.v1',

  // Entry that defines the MFE contract
  entry: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.analytics.mfe.chart.v1',

  // Optional: Lifecycle hooks
  lifecycle: [
    {
      stage: 'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
      actions_chain: {
        action: {
          type: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.load_data.v1',
          target: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.sidebar.v1',
        },
      },
    },
  ],
};
```

### Domain-Specific Extension Fields

If the domain specifies `extensionsTypeId`, you must use a derived Extension type with domain-specific fields:

```typescript
// First, register the derived Extension schema
const widgetExtensionSchema = {
  "$id": "gts://gts.frontx.mfes.ext.extension.v1~acme.dashboard.ext.widget_extension.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "allOf": [
    { "$ref": "gts://gts.frontx.mfes.ext.extension.v1~" }
  ],
  "properties": {
    "title": { "type": "string" },
    "icon": { "type": "string" },
    "size": { "enum": ["small", "medium", "large"] }
  },
  "required": ["title", "size"]
};

gtsPlugin.registerSchema(widgetExtensionSchema);

// Then create extensions with domain-specific fields
const widgetExtension: Extension = {
  id: 'gts.frontx.mfes.ext.extension.v1~acme.dashboard.ext.widget_extension.v1~acme.analytics.v1',
  domain: 'gts.frontx.mfes.ext.domain.v1~acme.dashboard.layout.widget_slot.v1',
  entry: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.analytics.mfe.chart.v1',

  // Domain-specific fields (defined in derived schema)
  title: 'Analytics Dashboard',
  icon: 'chart-line',
  size: 'large',
};
```

## Actions and Communication

### Defining Custom Actions

Actions use a derived Action type with vendor-specific payload schema:

```typescript
// Define the action schema
const dataUpdatedSchema = {
  "$id": "gts://gts.frontx.mfes.comm.action.v1~acme.analytics.comm.data_updated.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "allOf": [
    { "$ref": "gts://gts.frontx.mfes.comm.action.v1~" }
  ],
  "properties": {
    "payload": {
      "type": "object",
      "properties": {
        "datasetId": { "type": "string" },
        "metrics": {
          "type": "array",
          "items": { "type": "string" }
        },
        "timestamp": { "type": "number" }
      },
      "required": ["datasetId", "metrics"]
    }
  }
};

// Register the schema
gtsPlugin.registerSchema(dataUpdatedSchema);

// Create action instances
const action: Action = {
  type: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.data_updated.v1',
  target: 'gts.frontx.mfes.ext.extension.v1~acme.dashboard.extension.v1',
  payload: {
    datasetId: 'sales-q4',
    metrics: ['revenue', 'conversions'],
    timestamp: Date.now(),
  },
  // Optional: Override domain's defaultActionTimeout
  timeout: 10000, // 10 seconds
};
```

### Action Chains

Actions can be chained with success (`next`) and failure (`fallback`) paths:

```typescript
import type { ActionsChain } from '@gears-frontx/screensets';

const chain: ActionsChain = {
  action: {
    type: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.fetch_data.v1',
    target: extensionId,
  },
  next: {
    // Execute on success
    action: {
      type: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.render_chart.v1',
      target: extensionId,
    },
  },
  fallback: {
    // Execute on failure (including timeout)
    action: {
      type: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.show_error.v1',
      target: extensionId,
    },
  },
};
```

### Using the Child Bridge

MFEs receive a `ChildMfeBridge` for communicating with the host:

```typescript
import type { ChildMfeBridge, MfeEntryLifecycle } from '@gears-frontx/screensets';

export const ChartWidget: MfeEntryLifecycle = {
  async mount(container: Element, bridge: ChildMfeBridge) {
    // Subscribe to shared properties
    bridge.subscribeToProperty(
      'gts.frontx.mfes.comm.shared_property.v1~acme.analytics.theme.v1',
      (property) => {
        console.log('Theme updated:', property.value);
      }
    );

    // Get property synchronously
    const theme = bridge.getProperty(
      'gts.frontx.mfes.comm.shared_property.v1~acme.analytics.theme.v1'
    );

    // Send action chain to domain
    await bridge.sendActionsChain({
      action: {
        type: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.data_ready.v1',
        target: bridge.domainId,
        payload: { status: 'loaded' },
      },
    });

    // Render your MFE
    // ... your framework-specific rendering code
  },

  async unmount(container: Element) {
    // Cleanup
  },
};
```

## Lifecycle Management

### Default Lifecycle Stages

FrontX provides 4 default lifecycle stages:

1. **init** - `gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1`
   - Triggered: After extension registration

2. **activated** - `gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1`
   - Triggered: After mount to DOM

3. **deactivated** - `gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1`
   - Triggered: After unmount from DOM

4. **destroyed** - `gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1`
   - Triggered: Before unregistration

### Defining Custom Lifecycle Stages

Domains can define custom stages:

```typescript
const customDomain: ExtensionDomain = {
  id: 'gts.frontx.mfes.ext.domain.v1~acme.dashboard.layout.widget_slot.v1',
  // ... other fields
  extensionsLifecycleStages: [
    // Default stages
    'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
    'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1',
    'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1',
    'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
    // Custom stage
    'gts.frontx.mfes.lifecycle.stage.v1~acme.dashboard.lifecycle.refresh.v1',
  ],
};
```

### Adding Lifecycle Hooks to Extensions

```typescript
const extensionWithHooks: Extension = {
  id: 'gts.frontx.mfes.ext.extension.v1~acme.analytics.extension.v1',
  domain: 'gts.frontx.mfes.ext.domain.v1~acme.dashboard.layout.widget_slot.v1',
  entry: 'gts.frontx.mfes.mfe.entry.v1~acme.analytics.entry.v1',

  lifecycle: [
    {
      stage: 'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
      actions_chain: {
        action: {
          type: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.initialize.v1',
          target: 'gts.frontx.mfes.ext.extension.v1~acme.analytics.extension.v1',
        },
      },
    },
    {
      stage: 'gts.frontx.mfes.lifecycle.stage.v1~acme.dashboard.lifecycle.refresh.v1',
      actions_chain: {
        action: {
          type: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.reload_data.v1',
          target: 'gts.frontx.mfes.ext.extension.v1~acme.analytics.extension.v1',
        },
      },
    },
  ],
};
```

## Dynamic Registration

Extensions can be registered at any time during runtime:

```typescript
import { ContainerProvider } from '@gears-frontx/screensets';

// Define a ContainerProvider for your domain
class WidgetContainerProvider extends ContainerProvider {
  getContainer(extensionId: string): Element {
    // Return the DOM element where the extension should mount
    return document.getElementById('widget-container')!;
  }

  releaseContainer(extensionId: string): void {
    // Cleanup if needed (optional)
  }
}

// Get the registry instance from the framework
const runtime = framework.get<ScreensetsRegistry>('screensetsRegistry');

// Register domain with container provider
const containerProvider = new WidgetContainerProvider();
await runtime.registerDomain(myDomain, containerProvider);

// Register your extension dynamically
await runtime.registerExtension(myExtension);

// Mount via actions chain (auto-loads if needed, container from provider)
await runtime.executeActionsChain({
  action: {
    type: Gears FrontX_ACTION_MOUNT_EXT,
    target: myExtension.domain,
    payload: { extensionId: myExtension.id },
  },
});

// Query bridge after mount
const bridge = runtime.getParentBridge(myExtension.id);

// Later: unmount via actions chain (keeps extension registered and bundle loaded)
await runtime.executeActionsChain({
  action: {
    type: Gears FrontX_ACTION_UNMOUNT_EXT,
    target: myExtension.domain,
    payload: { extensionId: myExtension.id },
  },
});

// Finally: unregister (triggers destroyed lifecycle, auto-unmounts if mounted)
await runtime.unregisterExtension(myExtension.id);
```

### ContainerProvider Abstract Class

The `ContainerProvider` abstract class defines how containers are allocated for extensions:

```typescript
abstract class ContainerProvider {
  /**
   * Allocate a DOM container for an extension.
   * Called during mount_ext action.
   */
  abstract getContainer(extensionId: string): Element;

  /**
   * Release a DOM container after unmount.
   * Called during unmount_ext action.
   */
  abstract releaseContainer(extensionId: string): void;
}
```

Implement this class to control where extensions mount in your application.

## Best Practices

### 1. Type ID Conventions

- Use your vendor namespace: `gts.<vendor>.<package>.<namespace>.<type>.v<MAJOR>~`
- Keep type IDs as constants for reusability
- Schema IDs end with `~`, instance IDs do NOT

### 2. Contract Design

- Minimize `requiredProperties` - prefer `optionalProperties` for flexibility
- Design actions for specific purposes (not generic "update" actions)
- Keep payload schemas well-defined and versioned

### 3. Error Handling

- Always handle action chain failures with `fallback`
- Implement proper timeout handling (use domain's defaultActionTimeout wisely)
- Validate payloads before sending actions

### 4. Performance

- Use `executeActionsChain()` with `Gears FrontX_ACTION_LOAD_EXT` for hover-to-load UX
- Minimize shared dependency versions for better code sharing
- Keep MFE bundles small (lazy load heavy dependencies)

### 5. Isolation

- Default handler enforces instance-level isolation (`singleton: false`)
- Each MFE instance has its own runtime and state
- Only pure utility libraries should use `singleton: true`

### 6. Testing

- Test contract validation with mismatched properties/actions
- Test action chains with success/failure paths
- Test lifecycle hooks execute in correct order
- Test with custom TypeSystemPlugin implementations

### 7. Documentation

- Document your entry contract (required/optional properties, actions)
- Provide example extension configurations
- Document custom lifecycle stages if your domain defines them
- Include integration examples with different frameworks

## Next Steps

- See [TypeSystemPlugin Interface](./plugin-interface.md) for plugin abstraction details
- See [GTS Plugin Usage](./gts-plugin.md) for GTS-specific features
- See [Custom Plugin Implementation](./custom-plugin-guide.md) for creating custom plugins
- See [Example MFE Implementation](./example-mfe.md) for a complete working example
