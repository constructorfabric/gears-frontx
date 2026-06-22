# Example MFE Implementation with GTS Plugin

This document provides a complete, working example of creating a microfrontend (MFE) extension using FrontX's MFE system with the GTS plugin.

## Overview

This example implements an analytics widget MFE that:

- Uses Module Federation for loading
- Subscribes to shared theme properties
- Sends action chains to the host
- Implements lifecycle hooks
- Uses custom derived types for richer contracts

## Project Structure

```
analytics-mfe/
├── src/
│   ├── index.ts                 # Entry point
│   ├── ChartWidget.tsx          # Main component
│   ├── types/
│   │   ├── schemas.ts           # GTS schemas
│   │   └── constants.ts         # Type ID constants
│   └── integration/
│       └── register.ts          # Extension registration
├── webpack.config.js            # Module Federation config
└── package.json
```

## Step 1: Define GTS Schemas

### schemas.ts

```typescript
import type { JSONSchema } from '@gears-frontx/screensets/types';

/**
 * Custom action for data updates
 */
export const dataUpdatedActionSchema: JSONSchema = {
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

/**
 * Custom entry type with analytics-specific contract
 */
export const analyticsEntrySchema: JSONSchema = {
  "$id": "gts://gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.analytics.mfe.entry_analytics.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "allOf": [
    { "$ref": "gts://gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~" }
  ],
  "properties": {
    "analyticsConfig": {
      "type": "object",
      "properties": {
        "defaultDataset": { "type": "string" },
        "refreshInterval": { "type": "number" },
        "metricsToTrack": {
          "type": "array",
          "items": { "type": "string" }
        }
      },
      "required": ["defaultDataset"]
    }
  },
  "required": ["analyticsConfig"]
};

/**
 * Theme shared property
 */
export const themePropertySchema: JSONSchema = {
  "$id": "gts://gts.frontx.mfes.comm.shared_property.v1~acme.analytics.theme.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "allOf": [
    { "$ref": "gts://gts.frontx.mfes.comm.shared_property.v1~" }
  ],
  "properties": {
    "value": {
      "type": "object",
      "properties": {
        "mode": { "enum": ["light", "dark"] },
        "primaryColor": { "type": "string" }
      },
      "required": ["mode"]
    }
  }
};

/**
 * Manifest for analytics MFE
 */
export const analyticsManifestSchema: JSONSchema = {
  "$id": "gts://gts.frontx.mfes.mfe.mf_manifest.v1~acme.analytics.manifest.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "allOf": [
    { "$ref": "gts://gts.frontx.mfes.mfe.mf_manifest.v1~" }
  ]
};
```

### constants.ts

```typescript
// Type IDs (reference only - no runtime generation)
export const TYPE_IDS = {
  // Actions (instance IDs - no trailing ~)
  DATA_UPDATED: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.data_updated.v1',
  REFRESH_REQUEST: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.refresh_request.v1',

  // Shared Properties
  THEME: 'gts.frontx.mfes.comm.shared_property.v1~acme.analytics.theme.v1',

  // Entry
  ANALYTICS_ENTRY_MF: 'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~acme.analytics.mfe.entry_analytics.v1',

  // Extension
  ANALYTICS_EXTENSION: 'gts.frontx.mfes.ext.extension.v1~acme.analytics.extension.v1',

  // Manifest
  ANALYTICS_MANIFEST: 'gts.frontx.mfes.mfe.mf_manifest.v1~acme.analytics.manifest.v1',
} as const;
```

## Step 2: Implement the MFE Component

### ChartWidget.tsx

```typescript
import React, { useEffect, useState } from 'react';
import type { ChildMfeBridge, MfeEntryLifecycle, SharedProperty } from '@gears-frontx/screensets';
import { TYPE_IDS } from './types/constants';

interface ChartWidgetProps {
  bridge: ChildMfeBridge;
  config: {
    defaultDataset: string;
    refreshInterval: number;
    metricsToTrack: string[];
  };
}

function ChartWidget({ bridge, config }: ChartWidgetProps) {
  const [theme, setTheme] = useState<{ mode: 'light' | 'dark'; primaryColor: string } | null>(null);
  const [data, setData] = useState<unknown>(null);

  useEffect(() => {
    // Subscribe to theme updates
    const unsubscribe = bridge.subscribeToProperty(
      TYPE_IDS.THEME,
      (property: SharedProperty) => {
        setTheme(property.value as { mode: 'light' | 'dark'; primaryColor: string });
      }
    );

    // Get initial theme
    const initialTheme = bridge.getProperty(TYPE_IDS.THEME);
    if (initialTheme) {
      setTheme(initialTheme.value as { mode: 'light' | 'dark'; primaryColor: string });
    }

    // Send initial data loaded action
    bridge.sendActionsChain({
      action: {
        type: TYPE_IDS.DATA_UPDATED,
        target: bridge.domainId,
        payload: {
          datasetId: config.defaultDataset,
          metrics: config.metricsToTrack,
          timestamp: Date.now(),
        },
      },
    }).catch(error => {
      console.error('Failed to send data updated action:', error);
    });

    return () => {
      unsubscribe();
    };
  }, [bridge, config]);

  return (
    <div
      style={{
        backgroundColor: theme?.mode === 'dark' ? '#1a1a1a' : '#ffffff',
        color: theme?.mode === 'dark' ? '#ffffff' : '#000000',
        padding: '20px',
        borderRadius: '8px',
      }}
    >
      <h2 style={{ color: theme?.primaryColor }}>Analytics Dashboard</h2>
      <p>Dataset: {config.defaultDataset}</p>
      <p>Tracking: {config.metricsToTrack.join(', ')}</p>
      <div>
        {/* Chart rendering would go here */}
        <p>Chart data would be rendered here...</p>
      </div>
    </div>
  );
}

/**
 * MFE Entry Lifecycle Implementation
 */
export const ChartWidgetLifecycle: MfeEntryLifecycle = {
  async mount(container: Element, bridge: ChildMfeBridge) {
    // Get analytics config from entry (would be passed through)
    const config = {
      defaultDataset: 'sales-q4',
      refreshInterval: 30000,
      metricsToTrack: ['revenue', 'conversions', 'ctr'],
    };

    // Render React component
    const React = await import('react');
    const ReactDOM = await import('react-dom/client');

    const root = ReactDOM.createRoot(container);
    root.render(
      React.createElement(ChartWidget, { bridge, config })
    );

    // Store root for unmount
    (container as Element & { __root?: unknown }).__root = root;
  },

  async unmount(container: Element) {
    const root = (container as Element & { __root?: unknown }).__root;
    if (root && typeof (root as { unmount?: () => void }).unmount === 'function') {
      (root as { unmount: () => void }).unmount();
    }
  },
};
```

### index.ts

```typescript
import { ChartWidgetLifecycle } from './ChartWidget';

// Export the lifecycle for Module Federation
export default ChartWidgetLifecycle;

// Named export for convenience
export { ChartWidgetLifecycle };
```

## Step 3: Configure Module Federation

### webpack.config.js

```javascript
const ModuleFederationPlugin = require('webpack/lib/container/ModuleFederationPlugin');
const path = require('path');

module.exports = {
  entry: './src/index.ts',
  mode: 'production',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    publicPath: 'auto',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new ModuleFederationPlugin({
      name: 'analyticsWidget',
      filename: 'remoteEntry.js',
      exposes: {
        './ChartWidget': './src/index.ts',
      },
      shared: {
        react: {
          singleton: false, // Instance isolation
          requiredVersion: '^18.2.0',
        },
        'react-dom': {
          singleton: false, // Instance isolation
          requiredVersion: '^18.2.0',
        },
      },
    }),
  ],
};
```

### package.json

```json
{
  "name": "@acme/analytics-mfe",
  "version": "1.0.0",
  "scripts": {
    "build": "webpack",
    "serve": "webpack serve --port 3001"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@gears-frontx/screensets": "latest",
    "@globaltypesystem/gts-ts": "latest",
    "typescript": "^5.4.2",
    "ts-loader": "^9.5.0",
    "webpack": "^5.89.0",
    "webpack-cli": "^5.1.4",
    "webpack-dev-server": "^4.15.1"
  }
}
```

## Step 4: Registration in Host Application

### register.ts

```typescript
import { gtsPlugin } from '@gears-frontx/screensets/plugins/gts';
import type {
  MfeEntryMF,
  Extension,
  MfManifest,
} from '@gears-frontx/screensets';
import type { ScreensetsRegistry } from '@gears-frontx/screensets/runtime';
import {
  dataUpdatedActionSchema,
  analyticsEntrySchema,
  themePropertySchema,
  analyticsManifestSchema,
} from './types/schemas';
import { TYPE_IDS } from './types/constants';

/**
 * Register analytics MFE schemas and extension with the host runtime.
 */
export async function registerAnalyticsMfe(runtime: ScreensetsRegistry) {
  // Step 1: Register vendor schemas with GTS plugin
  gtsPlugin.registerSchema(dataUpdatedActionSchema);
  gtsPlugin.registerSchema(analyticsEntrySchema);
  gtsPlugin.registerSchema(themePropertySchema);
  gtsPlugin.registerSchema(analyticsManifestSchema);

  // Step 2: Define the manifest (enriched at build time by frontx-mf-gts plugin;
  // shared deps derived automatically from rollupOptions.external)
  const manifest: MfManifest = {
    id: TYPE_IDS.ANALYTICS_MANIFEST,
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

  // Register manifest as GTS entity
  gtsPlugin.register(manifest);

  // Step 3: Define the MFE entry
  const entry: MfeEntryMF = {
    // Instance ID (does NOT end with ~)
    id: `${TYPE_IDS.ANALYTICS_ENTRY_MF}~acme.analytics.chart_widget.v1`,

    // Contract
    requiredProperties: [TYPE_IDS.THEME],
    optionalProperties: [],
    actions: [TYPE_IDS.DATA_UPDATED],
    domainActions: [TYPE_IDS.REFRESH_REQUEST],

    // Module Federation fields
    manifest: manifest.id,
    exposedModule: './ChartWidget',

    // Analytics-specific config (from derived type)
    analyticsConfig: {
      defaultDataset: 'sales-q4',
      refreshInterval: 30000,
      metricsToTrack: ['revenue', 'conversions', 'ctr'],
    },
  };

  // Register entry as GTS entity
  gtsPlugin.register(entry);

  // Step 4: Define the extension
  const extension: Extension = {
    // Instance ID (does NOT end with ~)
    id: `${TYPE_IDS.ANALYTICS_EXTENSION}~acme.analytics.sidebar_widget.v1`,

    // Bind to sidebar domain
    domain: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.sidebar.v1',

    // Reference the entry
    entry: entry.id,

    // Lifecycle hooks
    lifecycle: [
      {
        stage: 'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
        actions_chain: {
          action: {
            type: TYPE_IDS.DATA_UPDATED,
            target: entry.id,
            payload: {
              datasetId: 'sales-q4',
              metrics: ['revenue'],
              timestamp: Date.now(),
            },
          },
        },
      },
    ],
  };

  // Step 5: Register extension with runtime
  await runtime.registerExtension(extension);

  // Step 6: Mount via actions chain (auto-loads if needed)
  await runtime.executeActionsChain({
    action: {
      type: 'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.mount_ext.v1~',
      target: extension.domain,
      payload: { subject: extension.id },
    },
  });

  // Query bridge after mount
  const bridge = runtime.getParentBridge(extension.id);
  console.log('Analytics MFE mounted with bridge:', bridge);
}
```

### Host application usage

```typescript
import { screensetsRegistryFactory, gtsPlugin } from '@gears-frontx/screensets';
import { registerAnalyticsMfe } from './register';

// Build the registry with GTS plugin at application wiring time
const registry = screensetsRegistryFactory.build({ typeSystem: gtsPlugin });

// Create a container provider for the domain
import { ContainerProvider } from '@gears-frontx/screensets';

class SidebarContainerProvider extends ContainerProvider {
  getContainer(extensionId: string): Element {
    return document.getElementById('sidebar-widget-slot')!;
  }

  releaseContainer(extensionId: string): void {
    // Cleanup if needed
  }
}

const containerProvider = new SidebarContainerProvider();

// Register sidebar domain first (with container provider)
await registry.registerDomain({
  id: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.sidebar.v1',
  sharedProperties: [
    'gts.frontx.mfes.comm.shared_property.v1~acme.analytics.theme.v1',
  ],
  actions: [
    'gts.frontx.mfes.comm.action.v1~frontx.mfes.ext.load_ext.v1~',
  ],
  extensionsActions: [
    'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.data_updated.v1~',
  ],
  defaultActionTimeout: 5000,
  lifecycleStages: [
    'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
    'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.activated.v1',
    'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.deactivated.v1',
    'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.destroyed.v1',
  ],
  extensionsLifecycleStages: [
    'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
  ],
}, containerProvider);

// Register and load the analytics MFE
await registerAnalyticsMfe(runtime);
```

## Step 5: Update Shared Properties

```typescript
// Update theme for all domains that declare this shared property
runtime.updateSharedProperty(
  'gts.frontx.mfes.comm.shared_property.v1~acme.analytics.theme.v1',
  {
    mode: 'dark',
    primaryColor: '#00aaff',
  }
);

// MFE will receive the update via its bridge subscription
```

## Key Concepts Demonstrated

### 1. Opaque Type IDs

Type IDs are string constants - never parsed manually:

```typescript
// ✅ Correct - using constants
const THEME_TYPE_ID = 'gts.frontx.mfes.comm.shared_property.v1~acme.analytics.theme.v1';

// ✅ Correct - calling plugin when metadata needed
const parsed = gtsPlugin.parseTypeId(THEME_TYPE_ID);
console.log('Vendor:', parsed.vendor);

// ❌ Wrong - manual parsing
const parts = THEME_TYPE_ID.split('.');
```

### 2. GTS-Native Validation

Register entities first, then validate by ID:

```typescript
// Register
gtsPlugin.register(extension);

// Validate
const validation = gtsPlugin.validateInstance(extension.id);
```

### 3. Actions Chain Execution

Actions chains route through the mediator:

```typescript
await bridge.sendActionsChain({
  action: {
    type: TYPE_IDS.DATA_UPDATED,
    target: bridge.domainId,
    payload: { /* ... */ },
  },
  next: {
    // Execute on success
    action: { /* ... */ },
  },
  fallback: {
    // Execute on failure
    action: { /* ... */ },
  },
});
```

### 4. Lifecycle Hooks

Hooks trigger action chains at lifecycle stages:

```typescript
lifecycle: [
  {
    stage: 'gts.frontx.mfes.lifecycle.stage.v1~frontx.mfes.lifecycle.init.v1',
    actions_chain: {
      action: {
        type: TYPE_IDS.DATA_UPDATED,
        target: entry.id,
        payload: { /* ... */ },
      },
    },
  },
]
```

## Testing

### Unit Tests

```typescript
import { describe, it, expect } from 'vitest';
import { TYPE_IDS } from './types/constants';
import { gtsPlugin } from '@gears-frontx/screensets/plugins/gts';

describe('Analytics MFE', () => {
  it('should have valid type IDs', () => {
    Object.values(TYPE_IDS).forEach(typeId => {
      expect(gtsPlugin.isValidTypeId(typeId)).toBe(true);
    });
  });

  it('should register schemas successfully', () => {
    gtsPlugin.registerSchema(dataUpdatedActionSchema);
    const schema = gtsPlugin.getSchema(
      'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.data_updated.v1~'
    );
    expect(schema).toBeDefined();
  });
});
```

### Integration Tests

```typescript
import { describe, it, expect } from 'vitest';
import { DefaultScreensetsRegistry, gtsPlugin } from '@gears-frontx/screensets';
import { registerAnalyticsMfe } from './register';

describe('Analytics MFE Integration', () => {
  it('should register and mount successfully', async () => {
    const runtime = new DefaultScreensetsRegistry({ typeSystem: gtsPlugin });

    // Register domain first
    await runtime.registerDomain({ /* ... */ }, containerProvider);

    // Register MFE
    await expect(registerAnalyticsMfe(runtime)).resolves.not.toThrow();
  });
});
```

## Related Documentation

- [Vendor Development Guide](./vendor-guide.md) - Complete vendor guide
- [TypeSystemPlugin Interface](./plugin-interface.md) - Plugin interface details
- [GTS Plugin Usage](./gts-plugin.md) - GTS-specific features
- [Custom Plugin Implementation](./custom-plugin-guide.md) - Creating custom plugins

## Notes

### Type ID Opaqueness

Always treat type IDs as opaque strings. Call plugin methods when you need metadata:

```typescript
// Get metadata about a type ID
const parsed = gtsPlugin.parseTypeId(typeId);
console.log('Vendor:', parsed.vendor);
console.log('Package:', parsed.package);

// Get attributes from a type
const result = gtsPlugin.getAttribute(domainId, 'extensionsTypeId');
if (result.resolved) {
  console.log('Required extension type:', result.value);
}
```

### Actions Chain Contains Instances

`ActionsChain` contains actual `Action` instances (embedded objects), not type ID references:

```typescript
// ✅ Correct - Action instances
const chain: ActionsChain = {
  action: {
    type: TYPE_IDS.DATA_UPDATED,
    target: bridge.domainId,
    payload: { /* ... */ },
  },
};

// ❌ Wrong - Type ID references
const chain = {
  action: TYPE_IDS.DATA_UPDATED, // Wrong - should be an Action object
};
```
