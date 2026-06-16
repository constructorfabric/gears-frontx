# TypeSystemPlugin Interface Documentation

This document describes the `TypeSystemPlugin` interface, which abstracts type system operations for MFE contracts in FrontX.

## Overview

The `TypeSystemPlugin` interface enables FrontX to work with different type system implementations while shipping GTS (`@globaltypesystem/gts-ts`) as the default. The screensets package treats type IDs as **opaque strings** - all type ID understanding is delegated to the plugin.

**Key Principle**: When you need metadata about a type ID, call plugin methods (`parseTypeId()`, `getAttribute()`, etc.) directly. Never attempt to parse type IDs yourself.

## Interface Definition

```typescript
interface TypeSystemPlugin {
  /** Plugin identifier */
  readonly name: string;

  /** Plugin version */
  readonly version: string;

  // === Type ID Operations ===

  /**
   * Check if a string is a valid type ID format.
   * Used before any operation that requires a valid type ID.
   */
  isValidTypeId(id: string): boolean;

  /**
   * Parse a type ID into plugin-specific components.
   * Returns a generic object - the structure is plugin-defined.
   * Use this when you need metadata about a type ID.
   */
  parseTypeId(id: string): Record<string, unknown>;

  // === Schema Registry ===

  /**
   * Register a JSON Schema for validation.
   * The type ID is extracted from the schema's $id field.
   *
   * Note: First-class citizen schemas (MfeEntry, ExtensionDomain, Extension,
   * SharedProperty, Action, ActionsChain, LifecycleStage, LifecycleHook,
   * MfManifest, MfeEntryMF) are built into the plugin and do not need
   * to be registered. This method is for vendor/dynamic schemas only.
   */
  registerSchema(schema: JSONSchema): void;

  /**
   * Get the schema registered for a type ID (ends with ~)
   */
  getSchema(typeId: string): JSONSchema | undefined;

  // === Instance Registry (GTS-Native Approach) ===

  /**
   * Register any GTS entity (schema or instance) with the type system.
   * For instances, the entity must have an `id` field containing the instance ID.
   *
   * gts-ts uses the instance ID to automatically determine the schema:
   * - Instance ID: `gts.hai3.mfes.ext.extension.v1~acme.ext.widget.v1`
   * - Schema ID:   `gts.hai3.mfes.ext.extension.v1~` (extracted automatically)
   *
   * @param entity - The GTS entity to register (must have an `id` field)
   */
  register(entity: unknown): void;

  /**
   * Validate a registered instance by its instance ID.
   * The instance must be registered first via register().
   *
   * gts-ts extracts the schema ID from the instance ID automatically:
   * - Instance ID: `gts.hai3.mfes.ext.extension.v1~acme.ext.widget.v1`
   * - Schema ID:   `gts.hai3.mfes.ext.extension.v1~`
   *
   * @param instanceId - The instance ID (does NOT end with ~)
   * @returns Validation result
   */
  validateInstance(instanceId: string): ValidationResult;

  // === Query ===

  /**
   * Query registered type IDs matching a pattern
   */
  query(pattern: string, limit?: number): string[];

  // === Type Hierarchy ===

  /**
   * Check if a type ID is of (or derived from) a base type.
   * Used by MfeHandler.canHandle() for type hierarchy matching.
   *
   * @param typeId - The type ID to check
   * @param baseTypeId - The base type ID to check against
   * @returns true if typeId is the same as or derived from baseTypeId
   */
  isTypeOf(typeId: string, baseTypeId: string): boolean;

  // === Compatibility (REQUIRED) ===

  /**
   * Check compatibility between two type versions.
   * This method is REQUIRED - all plugins must implement it.
   */
  checkCompatibility(oldTypeId: string, newTypeId: string): CompatibilityResult;

  // === Attribute Access (REQUIRED for dynamic schema resolution) ===

  /**
   * Get an attribute value from a type using property path.
   * Used for dynamic schema resolution (e.g., getting domain's extensionsTypeId
   * to resolve derived Extension types).
   * This method is REQUIRED - all plugins must implement it.
   */
  getAttribute(typeId: string, path: string): AttributeResult;
}
```

## Supporting Types

### ValidationResult

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

interface ValidationError {
  path: string;
  message: string;
  keyword: string;
}
```

### CompatibilityResult

```typescript
interface CompatibilityResult {
  compatible: boolean;
  breaking: boolean;
  changes: CompatibilityChange[];
}

interface CompatibilityChange {
  type: 'added' | 'removed' | 'modified';
  path: string;
  description: string;
}
```

### AttributeResult

```typescript
interface AttributeResult {
  /** The type ID that was queried */
  typeId: string;
  /** The property path that was accessed */
  path: string;
  /** Whether the attribute was found */
  resolved: boolean;
  /** The value if resolved */
  value?: unknown;
  /** Error message if not resolved */
  error?: string;
}
```

## Method Groups

### Type ID Operations

These methods handle type ID validation and parsing:

- **`isValidTypeId(id)`**: Returns true if the string is a valid type ID format
- **`parseTypeId(id)`**: Parses type ID into components (structure is plugin-specific)

**Important**: Never parse type IDs yourself - always use the plugin methods.

### Schema Registry

These methods manage schema registration and retrieval:

- **`registerSchema(schema)`**: Registers a JSON Schema (type ID extracted from `schema.$id`)
- **`getSchema(typeId)`**: Retrieves a registered schema by type ID

**Note**: First-class citizen schemas (MfeEntry, ExtensionDomain, etc.) are built into the plugin. Only vendor/dynamic schemas need registration.

### Instance Registry (GTS-Native)

These methods manage instance registration and validation:

- **`register(entity)`**: Registers any GTS entity (schema or instance)
- **`validateInstance(instanceId)`**: Validates a registered instance

**Key Concept**: In GTS, you register instances first, then validate them by their instance ID. The plugin automatically extracts the schema ID from the chained instance ID.

### Query

- **`query(pattern, limit?)`**: Queries registered type IDs matching a pattern

Used for discovery and debugging.

### Type Hierarchy

- **`isTypeOf(typeId, baseTypeId)`**: Checks if a type derives from a base type

Used by `MfeHandler.canHandle()` for polymorphic handler selection.

### Compatibility (REQUIRED)

- **`checkCompatibility(oldTypeId, newTypeId)`**: Checks version compatibility

This method is **REQUIRED** - all plugins must implement it.

### Attribute Access (REQUIRED)

- **`getAttribute(typeId, path)`**: Gets attribute value from a type

Used for dynamic schema resolution. This method is **REQUIRED** - all plugins must implement it.

## Usage Examples

### Building the Registry

```typescript
import { screensetsRegistryFactory, gtsPlugin } from '@gears-frontx/screensets';

// Build the registry with GTS plugin at application wiring time
const registry = screensetsRegistryFactory.build({ typeSystem: gtsPlugin });

// Use the registry
registry.registerDomain(myDomain, containerProvider);
```

### Registering and Validating Entities

```typescript
import { screensetsRegistryFactory, gtsPlugin } from '@gears-frontx/screensets';

const registry = screensetsRegistryFactory.build({ typeSystem: gtsPlugin });

// Register an extension (as a GTS entity)
registry.typeSystem.register(extension);

// Validate the registered extension by its instance ID
const validation = registry.typeSystem.validateInstance(extension.id);
if (!validation.valid) {
  console.error('Extension validation failed:', validation.errors);
}
```

### Parsing Type IDs

```typescript
// Check if a string is a valid type ID
if (runtime.typeSystem.isValidTypeId(someString)) {
  // Parse it to get metadata
  const parsed = runtime.typeSystem.parseTypeId(someString);
  console.log('Vendor:', parsed.vendor);
  console.log('Package:', parsed.package);
  console.log('Version:', parsed.verMajor);
}
```

### Querying Type IDs

```typescript
// Find all action types from a vendor
const actionTypes = runtime.typeSystem.query(
  'gts.acme.*.comm.action.*',
  10
);
```

### Checking Type Hierarchy

```typescript
// Check if an entry type derives from MfeEntryMF
const isMfEntry = runtime.typeSystem.isTypeOf(
  entryTypeId,
  'gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~'
);
```

### Accessing Attributes

```typescript
// Get a domain's extensionsTypeId dynamically
const result = runtime.typeSystem.getAttribute(
  domainId,
  'extensionsTypeId'
);

if (result.resolved) {
  console.log('Domain requires extension type:', result.value);
}
```

## Built-in First-Class Citizen Schemas

The GTS plugin ships with these schemas built-in (no registration needed):

### Core Types (8 schemas)

1. **MfeEntry** - `gts.hai3.mfes.mfe.entry.v1~`
2. **ExtensionDomain** - `gts.hai3.mfes.ext.domain.v1~`
3. **Extension** - `gts.hai3.mfes.ext.extension.v1~`
4. **SharedProperty** - `gts.hai3.mfes.comm.shared_property.v1~`
5. **Action** - `gts.hai3.mfes.comm.action.v1~`
6. **ActionsChain** - `gts.hai3.mfes.comm.actions_chain.v1~`
7. **LifecycleStage** - `gts.hai3.mfes.lifecycle.stage.v1~`
8. **LifecycleHook** - `gts.hai3.mfes.lifecycle.hook.v1~`

### Default Lifecycle Stages (4 instances)

1. **init** - `gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.init.v1`
2. **activated** - `gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.activated.v1`
3. **deactivated** - `gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.deactivated.v1`
4. **destroyed** - `gts.hai3.mfes.lifecycle.stage.v1~hai3.mfes.lifecycle.destroyed.v1`

### Module Federation Types (2 schemas)

1. **MfManifest** - `gts.hai3.mfes.mfe.mf_manifest.v1~`
2. **MfeEntryMF** - `gts.hai3.mfes.mfe.entry.v1~hai3.mfes.mfe.entry_mf.v1~`

## Intentionally Omitted Methods

### `buildTypeId()`

**Reason**: GTS type IDs are consumed (validated, parsed) but never programmatically generated at runtime. All type IDs are defined as string constants.

If you need to construct type IDs, define them as constants:

```typescript
const MY_ACTION_TYPE = 'gts.acme.analytics.comm.action.v1~acme.analytics.comm.refresh.v1';
```

### `validateAgainstSchema()`

**Reason**: Extension validation uses native `validateInstance()` with derived Extension types. There's no need for a separate schema validation method.

## Plugin Lifecycle

1. **Creation**: Plugin singleton is pre-instantiated (e.g., `gtsPlugin`)
2. **Initialization**: First-class schemas are registered during construction
3. **Runtime Registration**: Vendor schemas registered via `registerSchema()`
4. **Entity Registration**: Entities registered via `register()`
5. **Validation**: Instances validated via `validateInstance()`
6. **Querying**: Type IDs queried via `query()`

## Error Handling

Plugins should throw clear errors for:

- Invalid type ID format (in `parseTypeId()`)
- Schema not found (in `getSchema()`)
- Instance not registered (in `validateInstance()`)
- Attribute not found (in `getAttribute()`)

Example:

```typescript
if (!result.ok) {
  throw new Error(`Invalid GTS ID: ${id} - ${result.error}`);
}
```

## Best Practices

### For Plugin Implementers

1. **Immutability**: Plugin state should be immutable where possible
2. **Performance**: Cache parsed results for frequently accessed type IDs
3. **Error Messages**: Provide clear, actionable error messages
4. **Type Safety**: Use TypeScript for plugin implementation
5. **Testing**: Thoroughly test all interface methods

### For Plugin Users

1. **Opaque Type IDs**: Never parse type IDs yourself - always use plugin methods
2. **Registration Order**: Register schemas before instances
3. **Validation**: Always validate instances after registration
4. **Error Handling**: Handle validation errors gracefully
5. **Plugin Consistency**: Use the same plugin instance throughout the runtime

## Related Documentation

- [GTS Plugin Usage](./gts-plugin.md) - GTS-specific features and usage
- [Custom Plugin Implementation](./custom-plugin-guide.md) - Creating custom plugins
- [Vendor Development Guide](./vendor-guide.md) - Using plugins in MFE development
- [Example MFE Implementation](./example-mfe.md) - Complete example using plugins

## Notes

### checkCompatibility is REQUIRED

All `TypeSystemPlugin` implementations **must** implement `checkCompatibility()`. This method is used for version compatibility checks during extension registration and updates.

### getAttribute is REQUIRED

All `TypeSystemPlugin` implementations **must** implement `getAttribute()`. This method is used for dynamic schema resolution (e.g., resolving `extensionsTypeId` from a domain to validate extension types).

### First-Class Schemas Are Built-In

The GTS plugin ships with all FrontX first-class citizen schemas built-in. You never need to call `registerSchema()` for core types. This method is only for vendor/dynamic schemas.

### Instance ID Convention

- **Schema IDs** end with `~`: `gts.hai3.mfes.ext.extension.v1~`
- **Instance IDs** do NOT end with `~`: `gts.hai3.mfes.ext.extension.v1~acme.ext.widget.v1`

The plugin automatically extracts the schema ID from chained instance IDs.
