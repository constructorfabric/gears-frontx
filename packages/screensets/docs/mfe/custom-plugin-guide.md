# Custom TypeSystemPlugin Implementation Guide

This guide explains how to implement a custom `TypeSystemPlugin` for HAI3's MFE system.

## Overview

While HAI3 ships with the GTS plugin as the default Type System implementation, you can create custom plugins for alternative type systems or to wrap GTS with additional functionality.

## When to Create a Custom Plugin

Consider creating a custom plugin if you need to:

- Use a different type system (not GTS)
- Add logging, metrics, or monitoring to type operations
- Implement custom validation rules
- Bridge existing type systems to HAI3
- Add caching layers or optimization

## Interface Requirements

Your custom plugin must implement the `TypeSystemPlugin` interface:

```typescript
interface TypeSystemPlugin {
  readonly name: string;
  readonly version: string;

  // Type ID Operations
  isValidTypeId(id: string): boolean;
  parseTypeId(id: string): Record<string, unknown>;

  // Schema Registry
  registerSchema(schema: JSONSchema): void;
  getSchema(typeId: string): JSONSchema | undefined;

  // Instance Registry
  register(entity: unknown): void;
  validateInstance(instanceId: string): ValidationResult;

  // Query
  query(pattern: string, limit?: number): string[];

  // Type Hierarchy
  isTypeOf(typeId: string, baseTypeId: string): boolean;

  // REQUIRED methods
  checkCompatibility(oldTypeId: string, newTypeId: string): CompatibilityResult;
  getAttribute(typeId: string, path: string): AttributeResult;
}
```

## Step-by-Step Implementation

### Step 1: Define the Plugin Class

```typescript
import type {
  TypeSystemPlugin,
  ValidationResult,
  CompatibilityResult,
  AttributeResult,
} from '@gears-frontx/screensets';
import type { JSONSchema } from '@gears-frontx/screensets/types';

export class CustomPlugin implements TypeSystemPlugin {
  readonly name = 'custom';
  readonly version = '1.0.0';

  private schemas = new Map<string, JSONSchema>();
  private instances = new Map<string, unknown>();

  constructor() {
    // Initialize with first-class citizen schemas if needed
    this.registerBuiltInSchemas();
  }

  private registerBuiltInSchemas(): void {
    // Register HAI3's first-class schemas here
    // (MfeEntry, ExtensionDomain, Extension, etc.)
  }

  // ... implement interface methods
}
```

### Step 2: Implement Type ID Operations

```typescript
  /**
   * Validate type ID format.
   * Adapt this to your type system's format.
   */
  isValidTypeId(id: string): boolean {
    // Example: simple namespace.type.version format
    const pattern = /^[a-z]+\.[a-z]+\.v\d+$/;
    return pattern.test(id);
  }

  /**
   * Parse type ID into components.
   * Return structure is plugin-specific.
   */
  parseTypeId(id: string): Record<string, unknown> {
    if (!this.isValidTypeId(id)) {
      throw new Error(`Invalid type ID: ${id}`);
    }

    // Example parsing for "namespace.type.v1" format
    const parts = id.split('.');
    const versionPart = parts[parts.length - 1];
    const version = parseInt(versionPart.substring(1), 10);

    return {
      namespace: parts[0],
      type: parts[1],
      version,
      raw: id,
    };
  }
```

### Step 3: Implement Schema Registry

```typescript
  /**
   * Register a schema.
   * Extract type ID from schema.$id.
   */
  registerSchema(schema: JSONSchema): void {
    if (!schema.$id) {
      throw new Error('Schema must have an $id field');
    }

    // Extract type ID (strip protocol if present)
    const typeId = schema.$id.replace(/^[a-z]+:\/\//, '');

    // Store the schema
    this.schemas.set(typeId, schema);
  }

  /**
   * Retrieve a registered schema.
   */
  getSchema(typeId: string): JSONSchema | undefined {
    return this.schemas.get(typeId);
  }
```

### Step 4: Implement Instance Registry

```typescript
  /**
   * Register an entity (schema or instance).
   * Instances must have an `id` field.
   */
  register(entity: unknown): void {
    if (!entity || typeof entity !== 'object') {
      throw new Error('Entity must be an object');
    }

    const typed = entity as { id?: string };
    if (!typed.id) {
      throw new Error('Entity must have an id field');
    }

    this.instances.set(typed.id, entity);
  }

  /**
   * Validate a registered instance.
   * You'll need a JSON Schema validator (e.g., Ajv).
   */
  validateInstance(instanceId: string): ValidationResult {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return {
        valid: false,
        errors: [{
          path: '',
          message: `Instance '${instanceId}' not registered`,
          keyword: 'registration',
        }],
      };
    }

    // Extract schema ID from instance ID
    // (implementation depends on your type system)
    const schemaId = this.extractSchemaId(instanceId);
    const schema = this.getSchema(schemaId);

    if (!schema) {
      return {
        valid: false,
        errors: [{
          path: '',
          message: `Schema '${schemaId}' not found`,
          keyword: 'schema',
        }],
      };
    }

    // Validate using your validator
    return this.validate(instance, schema);
  }

  private extractSchemaId(instanceId: string): string {
    // Example: if instanceId is "namespace.type.v1.instance1"
    // schema ID would be "namespace.type.v1"
    const parts = instanceId.split('.');
    return parts.slice(0, 3).join('.');
  }

  private validate(instance: unknown, schema: JSONSchema): ValidationResult {
    // Use Ajv or another validator
    // This is a simplified example
    return {
      valid: true,
      errors: [],
    };
  }
```

### Step 5: Implement Query

```typescript
  /**
   * Query type IDs matching a pattern.
   * Implement pattern matching for your type system.
   */
  query(pattern: string, limit?: number): string[] {
    // Simple glob-like pattern matching
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*') + '$'
    );

    // Query both schemas and instances
    const schemaIds = Array.from(this.schemas.keys());
    const instanceIds = Array.from(this.instances.keys());
    const allIds = [...schemaIds, ...instanceIds];

    // Filter by pattern
    const matches = allIds.filter(id => regex.test(id));

    // Apply limit if specified
    return limit ? matches.slice(0, limit) : matches;
  }
```

### Step 6: Implement Type Hierarchy

```typescript
  /**
   * Check if a type derives from a base type.
   * Implementation depends on your type system's inheritance model.
   */
  isTypeOf(typeId: string, baseTypeId: string): boolean {
    // Exact match
    if (typeId === baseTypeId) {
      return true;
    }

    // Check if typeId starts with baseTypeId (simple prefix matching)
    // Adapt this to your type system's hierarchy rules
    return typeId.startsWith(baseTypeId);
  }
```

### Step 7: Implement REQUIRED Methods

```typescript
  /**
   * Check compatibility between type versions.
   * REQUIRED - all plugins must implement this.
   */
  checkCompatibility(
    oldTypeId: string,
    newTypeId: string
  ): CompatibilityResult {
    const oldSchema = this.getSchema(oldTypeId);
    const newSchema = this.getSchema(newTypeId);

    if (!oldSchema || !newSchema) {
      return {
        compatible: false,
        breaking: true,
        changes: [{
          type: 'removed',
          path: '',
          description: 'Schema not found',
        }],
      };
    }

    // Implement compatibility checking logic
    // This is simplified - real implementation would be more complex
    const changes: CompatibilityChange[] = [];

    // Example: check if required fields were added (breaking change)
    // ... your compatibility logic here

    return {
      compatible: changes.length === 0,
      breaking: changes.some(c => c.type === 'removed'),
      changes,
    };
  }

  /**
   * Get an attribute from a type.
   * REQUIRED - used for dynamic schema resolution.
   */
  getAttribute(typeId: string, path: string): AttributeResult {
    const instance = this.instances.get(typeId);

    if (!instance || typeof instance !== 'object') {
      return {
        typeId,
        path,
        resolved: false,
        error: `Instance '${typeId}' not found or not an object`,
      };
    }

    // Navigate the property path
    const value = this.getNestedProperty(instance, path);

    if (value === undefined) {
      return {
        typeId,
        path,
        resolved: false,
        error: `Attribute '${path}' not found`,
      };
    }

    return {
      typeId,
      path,
      resolved: true,
      value,
    };
  }

  private getNestedProperty(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
```

### Step 8: Export Factory Function

```typescript
/**
 * Factory function to create plugin instances.
 */
export function createCustomPlugin(): TypeSystemPlugin {
  return new CustomPlugin();
}

/**
 * Singleton instance for convenience.
 */
export const customPlugin = createCustomPlugin();
```

## Example: Logging Plugin Wrapper

Here's an example of wrapping the GTS plugin with logging:

```typescript
import { gtsPlugin } from '@gears-frontx/screensets/plugins/gts';
import type { TypeSystemPlugin } from '@gears-frontx/screensets';

export class LoggingPluginWrapper implements TypeSystemPlugin {
  constructor(
    private readonly wrapped: TypeSystemPlugin,
    private readonly logger: Logger
  ) {}

  get name() { return `${this.wrapped.name}-logged`; }
  get version() { return this.wrapped.version; }

  isValidTypeId(id: string): boolean {
    this.logger.debug('isValidTypeId', { id });
    const result = this.wrapped.isValidTypeId(id);
    this.logger.debug('isValidTypeId result', { id, result });
    return result;
  }

  parseTypeId(id: string): Record<string, unknown> {
    this.logger.debug('parseTypeId', { id });
    try {
      const result = this.wrapped.parseTypeId(id);
      this.logger.debug('parseTypeId result', { id, result });
      return result;
    } catch (error) {
      this.logger.error('parseTypeId failed', { id, error });
      throw error;
    }
  }

  registerSchema(schema: JSONSchema): void {
    this.logger.info('registerSchema', { schemaId: schema.$id });
    this.wrapped.registerSchema(schema);
  }

  // ... delegate other methods with logging
}

// Usage
import { DefaultScreensetsRegistry, gtsPlugin } from '@gears-frontx/screensets';

const loggedPlugin = new LoggingPluginWrapper(gtsPlugin, myLogger);

const runtime = new DefaultScreensetsRegistry({
  typeSystem: loggedPlugin,
});
```

## Example: Caching Plugin Wrapper

Here's an example adding caching to type operations:

```typescript
export class CachingPluginWrapper implements TypeSystemPlugin {
  private parseCache = new Map<string, Record<string, unknown>>();
  private schemaCache = new Map<string, JSONSchema | undefined>();

  constructor(private readonly wrapped: TypeSystemPlugin) {}

  get name() { return `${this.wrapped.name}-cached`; }
  get version() { return this.wrapped.version; }

  parseTypeId(id: string): Record<string, unknown> {
    const cached = this.parseCache.get(id);
    if (cached) {
      return cached;
    }

    const result = this.wrapped.parseTypeId(id);
    this.parseCache.set(id, result);
    return result;
  }

  getSchema(typeId: string): JSONSchema | undefined {
    if (this.schemaCache.has(typeId)) {
      return this.schemaCache.get(typeId);
    }

    const result = this.wrapped.getSchema(typeId);
    this.schemaCache.set(typeId, result);
    return result;
  }

  // ... delegate other methods with caching where appropriate
}
```

## Testing Your Plugin

### Basic Plugin Tests

```typescript
import { describe, it, expect } from 'vitest';
import { createCustomPlugin } from './custom-plugin';

describe('CustomPlugin', () => {
  it('should validate type IDs correctly', () => {
    const plugin = createCustomPlugin();

    expect(plugin.isValidTypeId('namespace.type.v1')).toBe(true);
    expect(plugin.isValidTypeId('invalid')).toBe(false);
  });

  it('should parse type IDs correctly', () => {
    const plugin = createCustomPlugin();
    const parsed = plugin.parseTypeId('namespace.type.v1');

    expect(parsed.namespace).toBe('namespace');
    expect(parsed.type).toBe('type');
    expect(parsed.version).toBe(1);
  });

  it('should register and retrieve schemas', () => {
    const plugin = createCustomPlugin();
    const schema = {
      $id: 'namespace.type.v1',
      type: 'object',
      properties: {},
    };

    plugin.registerSchema(schema);
    const retrieved = plugin.getSchema('namespace.type.v1');

    expect(retrieved).toEqual(schema);
  });

  it('should validate instances', () => {
    const plugin = createCustomPlugin();

    // Register schema
    plugin.registerSchema({
      $id: 'namespace.type.v1',
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    });

    // Register instance
    plugin.register({
      id: 'namespace.type.v1.instance1',
      name: 'Test',
    });

    // Validate
    const result = plugin.validateInstance('namespace.type.v1.instance1');
    expect(result.valid).toBe(true);
  });

  it('should implement checkCompatibility', () => {
    const plugin = createCustomPlugin();

    const result = plugin.checkCompatibility(
      'namespace.type.v1',
      'namespace.type.v2'
    );

    expect(result).toHaveProperty('compatible');
    expect(result).toHaveProperty('breaking');
    expect(result).toHaveProperty('changes');
  });

  it('should implement getAttribute', () => {
    const plugin = createCustomPlugin();

    plugin.register({
      id: 'namespace.type.v1.instance1',
      name: 'Test',
      nested: {
        value: 42,
      },
    });

    const result = plugin.getAttribute(
      'namespace.type.v1.instance1',
      'nested.value'
    );

    expect(result.resolved).toBe(true);
    expect(result.value).toBe(42);
  });
});
```

### Integration Tests with ScreensetsRegistry

```typescript
import { describe, it, expect } from 'vitest';
import { DefaultScreensetsRegistry } from '@gears-frontx/screensets';
import { createCustomPlugin } from './custom-plugin';

describe('CustomPlugin Integration', () => {
  it('should work with ScreensetsRegistry', async () => {
    const plugin = createCustomPlugin();
    const runtime = new DefaultScreensetsRegistry({
      typeSystem: plugin,
    });

    // Verify plugin is used
    expect(runtime.typeSystem.name).toBe('custom');

    // Test domain registration
    const domain = {
      id: 'namespace.domain.v1.test',
      sharedProperties: [],
      actions: [],
      extensionsActions: [],
      defaultActionTimeout: 5000,
      lifecycleStages: [],
      extensionsLifecycleStages: [],
    };

    await expect(runtime.registerDomain(domain, containerProvider)).resolves.not.toThrow();
  });
});
```

## Best Practices

### 1. Error Handling

Always provide clear error messages:

```typescript
isValidTypeId(id: string): boolean {
  if (!id || typeof id !== 'string') {
    throw new Error('Type ID must be a non-empty string');
  }
  // ... validation logic
}
```

### 2. Immutability

Keep plugin state immutable where possible:

```typescript
registerSchema(schema: JSONSchema): void {
  // Create a deep copy to prevent external modifications
  const schemaCopy = JSON.parse(JSON.stringify(schema));
  this.schemas.set(typeId, schemaCopy);
}
```

### 3. Performance

Cache expensive operations:

```typescript
private parseCache = new Map<string, Record<string, unknown>>();

parseTypeId(id: string): Record<string, unknown> {
  if (this.parseCache.has(id)) {
    return this.parseCache.get(id)!;
  }
  const result = this.parseInternal(id);
  this.parseCache.set(id, result);
  return result;
}
```

### 4. Type Safety

Use TypeScript generics for type-safe implementations:

```typescript
class CustomPlugin<TSchema extends JSONSchema = JSONSchema>
  implements TypeSystemPlugin {
  private schemas = new Map<string, TSchema>();
  // ...
}
```

### 5. Documentation

Document your plugin's specific behaviors:

```typescript
/**
 * Custom plugin using simplified namespace.type.version format.
 *
 * Type ID Format: namespace.type.vN
 * Example: acme.widget.v1
 *
 * Type Hierarchy: Uses prefix matching
 * Example: acme.widget.v1.custom is considered a subtype of acme.widget.v1
 */
export class CustomPlugin implements TypeSystemPlugin {
  // ...
}
```

## Common Pitfalls

### 1. Not Implementing Required Methods

`checkCompatibility()` and `getAttribute()` are **REQUIRED**:

```typescript
// ❌ Wrong - throwing not implemented
checkCompatibility(): CompatibilityResult {
  throw new Error('Not implemented');
}

// ✅ Correct - providing implementation
checkCompatibility(oldTypeId: string, newTypeId: string): CompatibilityResult {
  // ... actual implementation
}
```

### 2. Incorrect Type Hierarchy Matching

Ensure `isTypeOf()` matches your type system's semantics:

```typescript
// ❌ Wrong - only exact match
isTypeOf(typeId: string, baseTypeId: string): boolean {
  return typeId === baseTypeId;
}

// ✅ Correct - checks derivation
isTypeOf(typeId: string, baseTypeId: string): boolean {
  return typeId === baseTypeId || typeId.startsWith(baseTypeId);
}
```

### 3. Missing Schema ID in registerSchema

Always extract the type ID from schema.$id:

```typescript
// ❌ Wrong - requires type ID parameter
registerSchema(typeId: string, schema: JSONSchema): void {
  this.schemas.set(typeId, schema);
}

// ✅ Correct - extracts from schema.$id
registerSchema(schema: JSONSchema): void {
  const typeId = this.extractTypeId(schema.$id);
  this.schemas.set(typeId, schema);
}
```

## Related Documentation

- [TypeSystemPlugin Interface](./plugin-interface.md) - Complete interface documentation
- [GTS Plugin Usage](./gts-plugin.md) - Default plugin implementation
- [Vendor Development Guide](./vendor-guide.md) - Using plugins for MFE development
- [Example MFE Implementation](./example-mfe.md) - Complete example

## Support

For questions or issues with custom plugin development:

1. Check the [TypeSystemPlugin Interface](./plugin-interface.md) documentation
2. Review the [GTS plugin source code](../../../src/mfe/plugins/gts/index.ts) as a reference
3. Run the test suite to verify compatibility
4. File an issue if you encounter interface problems
