# GTS Plugin Usage Guide

This document explains how to use the GTS (Global Type System) plugin with FrontX's MFE system.

## Overview

The GTS plugin (`gtsPlugin`) is FrontX's default `TypeSystemPlugin` implementation. It uses `@globaltypesystem/gts-ts` internally and comes with all first-class citizen schemas built-in.

## Installation

```bash
npm install @gears-frontx/screensets @globaltypesystem/gts-ts
```

The GTS plugin is included with `@gears-frontx/screensets` and requires `@globaltypesystem/gts-ts` as a peer dependency.

## Basic Usage

### Building the Registry

```typescript
import { screensetsRegistryFactory, gtsPlugin, ContainerProvider } from '@gears-frontx/screensets';

// Build the registry with GTS plugin at application wiring time
const registry = screensetsRegistryFactory.build({ typeSystem: gtsPlugin });

// Create a container provider for your domain
class MyContainerProvider extends ContainerProvider {
  getContainer(extensionId: string): Element {
    return document.getElementById('my-container')!;
  }
  releaseContainer(extensionId: string): void {
    // Cleanup if needed
  }
}

// Use the registry (with container provider)
const containerProvider = new MyContainerProvider();
registry.registerDomain(myDomain, containerProvider);
```

### Plugin is Ready Immediately

The GTS plugin ships with all FrontX first-class citizen schemas **built-in**. No registration needed:

```typescript
// ✅ Correct - Build registry with factory
import { screensetsRegistryFactory, gtsPlugin } from '@gears-frontx/screensets';
const registry = screensetsRegistryFactory.build({ typeSystem: gtsPlugin });
registry.registerDomain(myDomain, containerProvider);

// ❌ Wrong - No need to register core schemas
// gtsPlugin.registerSchema(mfeEntrySchema); // Don't do this
```

## GTS Type ID Format

GTS type IDs follow this structure:

```
gts.<vendor>.<package>.<namespace>.<type>.v<MAJOR>[.<MINOR>]~
```

### Schema vs Instance IDs

**Schema IDs** end with `~`:
```
gts.hai3.mfes.mfe.entry.v1~
gts.hai3.mfes.ext.extension.v1~
```

**Instance IDs** do NOT end with `~`:
```
gts.hai3.mfes.mfe.entry.v1~acme.analytics.mfe.chart.v1
gts.hai3.mfes.ext.extension.v1~acme.analytics.extension.v1
```

### Derived Types (Type Chaining)

Derived types include the base type ID as a prefix:

```
Base:    gts.hai3.mfes.mfe.entry.v1~
Derived: gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~
```

For instances of derived types:

```
Instance: gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~acme.analytics.mfe.chart.v1
Schema:   gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~ (extracted automatically)
```

## Type ID Operations

### Validating Type IDs

```typescript
// Check if a string is a valid GTS type ID
if (gtsPlugin.isValidTypeId('gts.hai3.mfes.ext.extension.v1~')) {
  console.log('Valid GTS type ID');
}

// Invalid formats will return false:
gtsPlugin.isValidTypeId('invalid-format'); // false
gtsPlugin.isValidTypeId('missing.tilde.v1'); // false
gtsPlugin.isValidTypeId('gts.only.v1'); // false (missing segments)
```

### Parsing Type IDs

```typescript
// Parse a type ID to get its components
const parsed = gtsPlugin.parseTypeId(
  'gts.hai3.mfes.mfe.entry.v1~acme.analytics.mfe.chart.v1'
);

console.log(parsed);
// Output:
// {
//   vendor: 'hai3',
//   package: 'mfes',
//   namespace: 'mfe',
//   type: 'entry',
//   verMajor: 1,
//   verMinor: undefined,
//   segments: [ ... ] // Array of all segments for derived types
// }
```

For derived types, the `segments` array contains all chained segments:

```typescript
const derivedParsed = gtsPlugin.parseTypeId(
  'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~'
);

console.log(derivedParsed.segments.length); // 2
// segments[0]: base type (MfeEntry)
// segments[1]: derived type (MfeEntryMF)
```

## Schema Management

### Registering Vendor Schemas

Only vendor/dynamic schemas need registration (first-class schemas are built-in):

```typescript
// Define a vendor-specific action schema
const customActionSchema = {
  "$id": "gts://gts.hai3.mfes.comm.action.v1~acme.analytics.comm.refresh.v1~",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "allOf": [
    { "$ref": "gts://gts.hai3.mfes.comm.action.v1~" }
  ],
  "properties": {
    "payload": {
      "type": "object",
      "properties": {
        "datasetId": { "type": "string" },
        "forced": { "type": "boolean" }
      },
      "required": ["datasetId"]
    }
  }
};

// Register it
gtsPlugin.registerSchema(customActionSchema);
```

**Note**: The type ID is automatically extracted from `schema.$id` - no need to pass it separately.

### Retrieving Schemas

```typescript
// Get a registered schema
const schema = gtsPlugin.getSchema('gts.hai3.mfes.comm.action.v1~');
console.log(schema); // JSONSchema object
```

## Instance Registration and Validation

### GTS-Native Validation Model

In GTS, entities (both schemas and instances) must be registered before validation:

```typescript
// 1. Register the instance
const extension = {
  id: 'gts.hai3.mfes.ext.extension.v1~acme.analytics.extension.v1',
  domain: 'gts.hai3.mfes.ext.domain.v1~hai3.screensets.layout.sidebar.v1',
  entry: 'gts.hai3.mfes.mfe.entry.v1~acme.analytics.mfe.chart.v1',
};

gtsPlugin.register(extension);

// 2. Validate the registered instance by its ID
const validation = gtsPlugin.validateInstance(extension.id);

if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
  validation.errors.forEach(err => {
    console.error(`  ${err.path}: ${err.message}`);
  });
}
```

### Schema ID Extraction

GTS automatically extracts the schema ID from the instance ID:

```
Instance ID: gts.hai3.mfes.ext.extension.v1~acme.analytics.extension.v1
             └─────────────────────────────┘
                    Schema ID (extracted automatically)
```

No need to specify the schema ID when validating - GTS figures it out.

## Type Hierarchy

### Checking Type Relationships

```typescript
// Check if a type derives from a base type
const isMfEntry = gtsPlugin.isTypeOf(
  'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~acme.analytics.mfe.chart.v1',
  'gts.hai3.mfes.mfe.entry.v1~'
);
console.log(isMfEntry); // true

// Check exact match
const isExactMfEntryMf = gtsPlugin.isTypeOf(
  'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~',
  'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~'
);
console.log(isExactMfEntryMf); // true
```

### Handler Type Matching

`MfeHandler.canHandle()` uses `isTypeOf()` for polymorphic matching:

```typescript
class MfeHandlerMF extends MfeHandler {
  constructor(typeSystem: TypeSystemPlugin) {
    super(
      typeSystem,
      'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~',
      0 // priority
    );
  }

  // canHandle() inherited from base uses:
  // this.typeSystem.isTypeOf(entryTypeId, this.handledBaseTypeId)
}

// Handler will match:
// ✅ gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~ (exact)
// ✅ gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~acme.corp.mfe.entry_mf_acme.v1~ (derived)
// ❌ gts.hai3.mfes.mfe.entry.v1~ (base type, not Module Federation entry)
```

## Querying Type IDs

### Pattern Matching

```typescript
// Find all action types from acme vendor
const acmeActions = gtsPlugin.query('gts.acme.*.comm.action.*', 10);
console.log(acmeActions);
// ['gts.acme.analytics.comm.action.v1~acme.analytics.comm.refresh.v1', ...]

// Find all extension types
const extensionTypes = gtsPlugin.query('gts.*.*.ext.extension.*');
console.log(extensionTypes);
// ['gts.hai3.mfes.ext.extension.v1~', ...]
```

## Compatibility Checking

### Version Compatibility

```typescript
const compat = gtsPlugin.checkCompatibility(
  'gts.hai3.mfes.mfe.entry.v1~',
  'gts.hai3.mfes.mfe.entry.v2~'
);

console.log(compat);
// {
//   compatible: false,
//   breaking: true,
//   changes: [
//     { type: 'removed', path: 'requiredProperties', description: '...' },
//     { type: 'added', path: 'newField', description: '...' }
//   ]
// }
```

## Attribute Access

### Dynamic Schema Resolution

```typescript
// Get an attribute from a registered domain
const result = gtsPlugin.getAttribute(
  'gts.hai3.mfes.ext.domain.v1~acme.dashboard.layout.widget_slot.v1',
  'extensionsTypeId'
);

if (result.resolved) {
  console.log('Domain requires extension type:', result.value);
  // e.g., 'gts.hai3.mfes.ext.extension.v1~acme.dashboard.ext.widget_extension.v1~'
} else {
  console.log('Attribute not found:', result.error);
}
```

This is used internally for resolving derived Extension types when validating extensions against domains.

## Built-In First-Class Schemas

The GTS plugin comes with these schemas registered automatically:

### Core Types (8 schemas)

| Type | Schema ID |
|------|-----------|
| MfeEntry | `gts.hai3.mfes.mfe.entry.v1~` |
| ExtensionDomain | `gts.hai3.mfes.ext.domain.v1~` |
| Extension | `gts.hai3.mfes.ext.extension.v1~` |
| SharedProperty | `gts.hai3.mfes.comm.shared_property.v1~` |
| Action | `gts.hai3.mfes.comm.action.v1~` |
| ActionsChain | `gts.hai3.mfes.comm.actions_chain.v1~` |
| LifecycleStage | `gts.hai3.mfes.lifecycle.stage.v1~` |
| LifecycleHook | `gts.hai3.mfes.lifecycle.hook.v1~` |

### Default Lifecycle Stages (4 instances)

| Stage | Instance ID |
|-------|-------------|
| init | `gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.init.v1` |
| activated | `gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.activated.v1` |
| deactivated | `gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.deactivated.v1` |
| destroyed | `gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.destroyed.v1` |

### Module Federation Types (2 schemas)

| Type | Schema ID |
|------|-----------|
| MfManifest | `gts.hai3.mfes.mfe.mf_manifest.v1~` |
| MfeEntryMF | `gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~` |

## Common Patterns

### Complete Extension Validation

```typescript
async function validateAndRegisterExtension(
  runtime: ScreensetsRegistry,
  extension: Extension
) {
  // 1. Register the extension entity
  runtime.typeSystem.register(extension);

  // 2. Validate the extension schema
  const validation = runtime.typeSystem.validateInstance(extension.id);
  if (!validation.valid) {
    throw new Error(`Extension validation failed: ${JSON.stringify(validation.errors)}`);
  }

  // 3. Get the entry and domain for contract validation
  const entry = runtime.getEntry(extension.entry);
  const domain = runtime.getDomain(extension.domain);

  // 4. Register with runtime (includes contract and type validation)
  await runtime.registerExtension(extension);
}
```

### Vendor Schema Registration Pattern

```typescript
// Define all your vendor schemas
const vendorSchemas = {
  actionRefresh: {
    "$id": "gts://gts.hai3.mfes.comm.action.v1~acme.analytics.comm.refresh.v1~",
    // ... schema definition
  },
  entryAcme: {
    "$id": "gts://gts.hai3.mfes.mfe.entry.v1~acme.corp.mfe.entry_acme.v1~",
    // ... schema definition
  },
  // ... more schemas
};

// Register them all at once
function registerVendorSchemas(plugin: TypeSystemPlugin) {
  Object.values(vendorSchemas).forEach(schema => {
    plugin.registerSchema(schema);
  });
}

// Usage
registerVendorSchemas(gtsPlugin);
```

## Error Handling

### Validation Errors

```typescript
const validation = gtsPlugin.validateInstance(extension.id);

if (!validation.valid) {
  validation.errors.forEach(error => {
    console.error('Validation error:');
    console.error('  Path:', error.path);
    console.error('  Message:', error.message);
    console.error('  Keyword:', error.keyword);
  });
}
```

### Type ID Parsing Errors

```typescript
try {
  const parsed = gtsPlugin.parseTypeId(invalidTypeId);
} catch (error) {
  console.error('Failed to parse type ID:', error.message);
}
```

## Performance Considerations

### Schema Registration Timing

Register vendor schemas once during application initialization:

```typescript
// ✅ Good - Register once at startup
import { screensetsRegistryFactory, gtsPlugin } from '@gears-frontx/screensets';

function initializeApp() {
  registerVendorSchemas(gtsPlugin);
  return screensetsRegistryFactory.build({ typeSystem: gtsPlugin });
}

// ❌ Bad - Registering repeatedly
function loadExtension(extension: Extension) {
  registerVendorSchemas(gtsPlugin); // Don't do this every time!
  // ...
}
```

### Query Optimization

Use specific patterns and limits for queries:

```typescript
// ✅ Good - Specific pattern with limit
const results = gtsPlugin.query('gts.acme.analytics.comm.action.*', 10);

// ❌ Bad - Broad pattern without limit
const results = gtsPlugin.query('gts.*.*.*.*.*'); // Expensive!
```

## Debugging

### Enable Debug Mode

```typescript
// For custom configurations, create a new instance
import { DefaultScreensetsRegistry, gtsPlugin } from '@gears-frontx/screensets';

const runtime = new DefaultScreensetsRegistry({
  typeSystem: gtsPlugin,
  debug: true, // Enable debug logging
});
```

### Inspect Plugin State

```typescript
// Check if a schema is registered
const schema = gtsPlugin.getSchema('gts.hai3.mfes.ext.extension.v1~');
console.log('Extension schema:', schema);

// Query all registered types
const allTypes = gtsPlugin.query('gts.*.*.*.*.*');
console.log('Registered types:', allTypes.length);
```

## Related Documentation

- [TypeSystemPlugin Interface](./plugin-interface.md) - Complete interface documentation
- [Vendor Development Guide](./vendor-guide.md) - Using GTS plugin for MFE development
- [Custom Plugin Implementation](./custom-plugin-guide.md) - Creating alternative plugins
- [Example MFE Implementation](./example-mfe.md) - Complete example using GTS plugin

## Notes

### No Direct Ajv Dependency

The GTS plugin uses `@globaltypesystem/gts-ts` which uses Ajv internally. You don't need a direct Ajv dependency in your project.

### Type ID Conventions

- Always use the full GTS format
- Schema IDs end with `~`, instance IDs do NOT
- Use your vendor namespace consistently
- Keep type IDs as constants for reusability

### First-Class Schemas

Never register first-class schemas yourself - they're built into the plugin. Only register vendor/dynamic schemas.
