# Type ID Principles and ActionsChain Structure

This document explains two critical principles of FrontX's MFE system:

1. **Opaque Type ID Principle** - Type IDs are opaque strings; call plugin methods when metadata is needed
2. **ActionsChain Structure** - ActionsChain contains Action instances (not type ID references)

## Opaque Type ID Principle

### Overview

In FrontX's MFE system, type IDs are treated as **opaque strings**. The screensets package never parses or interprets type IDs directly - all type ID understanding is delegated to the `TypeSystemPlugin`.

### Why Opaque Type IDs?

1. **Type System Abstraction**: Different type systems have different ID formats
2. **Plugin Flexibility**: Plugins can implement any ID structure
3. **Separation of Concerns**: Core MFE logic doesn't depend on type ID format
4. **Future-Proof**: New type systems can be added without changing core code

### The Rule

**When you need metadata about a type ID, call plugin methods. Never parse type IDs yourself.**

### Correct Usage

```typescript
import { gtsPlugin } from '@gears-frontx/screensets/plugins/gts';

// ✅ Correct - calling plugin method
const typeId = 'gts.frontx.mfes.mfe.entry.v1~acme.analytics.mfe.chart.v1';
const parsed = gtsPlugin.parseTypeId(typeId);
console.log('Vendor:', parsed.vendor);
console.log('Package:', parsed.package);
console.log('Version:', parsed.verMajor);

// ✅ Correct - using plugin for validation
if (gtsPlugin.isValidTypeId(someString)) {
  console.log('Valid type ID');
}

// ✅ Correct - using plugin for attributes
const result = gtsPlugin.getAttribute(domainId, 'extensionsTypeId');
if (result.resolved) {
  console.log('Domain requires:', result.value);
}
```

### Incorrect Usage

```typescript
// ❌ Wrong - manual parsing
const typeId = 'gts.frontx.mfes.mfe.entry.v1~acme.analytics.mfe.chart.v1';
const parts = typeId.split('.');
const vendor = parts[1];  // Fragile and breaks abstraction

// ❌ Wrong - manual validation
const isValid = typeId.includes('gts.') && typeId.includes('.v');

// ❌ Wrong - string manipulation
const schemaId = typeId.substring(0, typeId.lastIndexOf('~') + 1);

// ❌ Wrong - format assumptions
const version = parseInt(typeId.match(/v(\d+)/)[1]);
```

## Available Plugin Methods

### Type ID Operations

```typescript
// Check if string is a valid type ID
plugin.isValidTypeId(id: string): boolean

// Parse type ID into components (structure is plugin-specific)
plugin.parseTypeId(id: string): Record<string, unknown>
```

### Type Hierarchy

```typescript
// Check if type derives from base type
plugin.isTypeOf(typeId: string, baseTypeId: string): boolean
```

### Attribute Access

```typescript
// Get attribute value from a type
plugin.getAttribute(typeId: string, path: string): AttributeResult
```

### Schema Operations

```typescript
// Get registered schema
plugin.getSchema(typeId: string): JSONSchema | undefined

// Register new schema
plugin.registerSchema(schema: JSONSchema): void
```

### Instance Operations

```typescript
// Register entity
plugin.register(entity: unknown): void

// Validate registered instance
plugin.validateInstance(instanceId: string): ValidationResult
```

## GTS Plugin Specifics

### GTS Type ID Format

```
gts.<vendor>.<package>.<namespace>.<type>.v<MAJOR>[.<MINOR>]~
```

### Schema vs Instance IDs

**Schema IDs** end with `~`:
```typescript
const schemaId = 'gts.frontx.mfes.mfe.entry.v1~';
```

**Instance IDs** do NOT end with `~`:
```typescript
const instanceId = 'gts.frontx.mfes.mfe.entry.v1~acme.analytics.mfe.chart.v1';
```

### parseTypeId() Result Structure (GTS)

```typescript
const parsed = gtsPlugin.parseTypeId(
  'gts.frontx.mfes.mfe.entry.v1~acme.analytics.mfe.chart.v1'
);

// Result:
{
  vendor: 'frontx',
  package: 'mfes',
  namespace: 'mfe',
  type: 'entry',
  verMajor: 1,
  verMinor: undefined,
  segments: [
    // Array of GtsIDSegment for derived types
  ]
}
```

## ActionsChain Contains Action Instances

### Overview

`ActionsChain` contains actual `Action` **instances** (embedded objects), not type ID references. This is a critical design decision for the action mediation system.

### Why Instances, Not References?

1. **Self-Contained**: Chain contains all data needed for execution
2. **Validation**: Actions can be validated before execution
3. **Payload Inclusion**: Action payloads are part of the instance
4. **Timeout Configuration**: Action-level timeouts are in the instance
5. **Target Specification**: Each action knows its target

### The Structure

```typescript
interface Action {
  /** Self-reference to this action's type ID */
  type: string;
  /** Target type ID (ExtensionDomain or Extension) */
  target: string;
  /** Optional action payload */
  payload?: Record<string, unknown>;
  /** Optional timeout override in milliseconds */
  timeout?: number;
}

interface ActionsChain {
  /** Action instance (embedded object) */
  action: Action;
  /** Next chain to execute on success */
  next?: ActionsChain;
  /** Fallback chain to execute on failure */
  fallback?: ActionsChain;
}
```

### Correct Usage

```typescript
// ✅ Correct - Action instances in chain
const chain: ActionsChain = {
  action: {
    type: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.fetch_data.v1',
    target: extensionId,
    payload: {
      datasetId: 'sales-q4',
    },
    timeout: 10000,
  },
  next: {
    action: {
      type: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.render_chart.v1',
      target: extensionId,
      payload: {
        chartType: 'line',
      },
    },
  },
  fallback: {
    action: {
      type: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.show_error.v1',
      target: extensionId,
      payload: {
        message: 'Failed to load data',
      },
    },
  },
};

// Execute the chain
await runtime.executeActionsChain(chain);
```

### Incorrect Usage

```typescript
// ❌ Wrong - Type ID references instead of Action instances
const chain = {
  action: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.fetch_data.v1',
  next: {
    action: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.render_chart.v1',
  },
};

// ❌ Wrong - Missing required Action fields
const chain = {
  action: {
    type: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.fetch_data.v1',
    // Missing 'target' field!
  },
};

// ❌ Wrong - Payload outside Action
const chain = {
  action: {
    type: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.fetch_data.v1',
    target: extensionId,
  },
  payload: { datasetId: 'sales-q4' }, // Wrong - should be in action.payload
};
```

## Action Registration and Validation

### Action uses `type` as GTS Entity ID

Actions are registered using their `type` field as the entity identifier:

```typescript
// Action instance
const action: Action = {
  type: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.refresh.v1',
  target: extensionId,
  payload: {
    forced: true,
  },
};

// Register the action (uses action.type as entity ID)
plugin.register(action);

// Validate the action (uses action.type, not a synthetic ID)
const validation = plugin.validateInstance(action.type);
```

### No Synthetic IDs

**Never generate synthetic IDs for actions**:

```typescript
// ❌ Wrong - generating synthetic ID
const actionId = `${action.type}:${Date.now()}:${Math.random()}`;
plugin.register({ ...action, id: actionId });

// ✅ Correct - using action.type directly
plugin.register(action);
plugin.validateInstance(action.type);
```

The `type` field IS the action's identity. The Action schema annotates `type` with `x-gts-ref: "/$id"` to signal this.

## ActionsChain Has No `id` Field

`ActionsChain` is NOT referenced by other types, so it has **no `id` field**:

```typescript
// ✅ Correct - ActionsChain with no id
const chain: ActionsChain = {
  action: {
    type: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.refresh.v1',
    target: extensionId,
  },
};

// ❌ Wrong - adding id field
const chain = {
  id: 'some-chain-id', // Wrong - ActionsChain has no id field
  action: { /* ... */ },
};
```

## Practical Examples

### Example 1: Using Plugin Methods for Type Metadata

```typescript
import { gtsPlugin } from '@gears-frontx/screensets/plugins/gts';

function logTypeInfo(typeId: string) {
  // Use plugin to check validity
  if (!gtsPlugin.isValidTypeId(typeId)) {
    console.error('Invalid type ID:', typeId);
    return;
  }

  // Use plugin to parse
  const parsed = gtsPlugin.parseTypeId(typeId);
  console.log('Type Information:');
  console.log('  Vendor:', parsed.vendor);
  console.log('  Package:', parsed.package);
  console.log('  Type:', parsed.type);
  console.log('  Version:', `v${parsed.verMajor}${parsed.verMinor ? `.${parsed.verMinor}` : ''}`);

  // Use plugin to check type hierarchy
  const isMfeEntry = gtsPlugin.isTypeOf(typeId, 'gts.frontx.mfes.mfe.entry.v1~');
  console.log('  Is MFE Entry:', isMfeEntry);
}

// Usage
logTypeInfo('gts.frontx.mfes.mfe.entry.v1~acme.analytics.mfe.chart.v1');
```

### Example 2: Building Action Chains Correctly

```typescript
function createDataFlowChain(extensionId: string, datasetId: string): ActionsChain {
  return {
    // First: Fetch data
    action: {
      type: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.fetch_data.v1',
      target: extensionId,
      payload: { datasetId },
      timeout: 10000,
    },
    next: {
      // On success: Process data
      action: {
        type: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.process_data.v1',
        target: extensionId,
      },
      next: {
        // On success: Render chart
        action: {
          type: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.render_chart.v1',
          target: extensionId,
          payload: {
            chartType: 'line',
          },
        },
      },
      fallback: {
        // Processing failed
        action: {
          type: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.show_error.v1',
          target: extensionId,
          payload: {
            message: 'Failed to process data',
          },
        },
      },
    },
    fallback: {
      // Fetch failed
      action: {
        type: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.show_error.v1',
        target: extensionId,
        payload: {
          message: 'Failed to fetch data',
        },
      },
    },
  };
}
```

### Example 3: Dynamic Schema Resolution Using getAttribute

```typescript
async function validateExtensionType(
  plugin: TypeSystemPlugin,
  extension: Extension,
  domain: ExtensionDomain
): Promise<boolean> {
  // Use plugin to get domain's extensionsTypeId
  const result = plugin.getAttribute(domain.id, 'extensionsTypeId');

  // If domain doesn't specify extensionsTypeId, skip type check
  if (!result.resolved) {
    return true;
  }

  const requiredTypeId = result.value as string;

  // Use plugin to check type hierarchy
  const conformsToType = plugin.isTypeOf(extension.id, requiredTypeId);

  if (!conformsToType) {
    console.error(`Extension '${extension.id}' must derive from '${requiredTypeId}'`);
    return false;
  }

  return true;
}
```

## Common Mistakes and Solutions

### Mistake 1: Parsing Type IDs Manually

```typescript
// ❌ Wrong
const typeId = 'gts.frontx.mfes.mfe.entry.v1~acme.analytics.mfe.chart.v1';
const version = typeId.match(/v(\d+)/)[1];

// ✅ Correct
const parsed = plugin.parseTypeId(typeId);
const version = parsed.verMajor;
```

### Mistake 2: Using Type ID References in ActionsChain

```typescript
// ❌ Wrong
const chain = {
  action: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.refresh.v1',
};

// ✅ Correct
const chain: ActionsChain = {
  action: {
    type: 'gts.frontx.mfes.comm.action.v1~acme.analytics.comm.refresh.v1',
    target: extensionId,
  },
};
```

### Mistake 3: Adding id Field to ActionsChain

```typescript
// ❌ Wrong
const chain = {
  id: 'chain-1',
  action: { /* ... */ },
};

// ✅ Correct
const chain: ActionsChain = {
  action: { /* ... */ },
  next: { /* ... */ },
};
```

### Mistake 4: Generating Synthetic Action IDs

```typescript
// ❌ Wrong
const actionId = `${action.type}:${Date.now()}:${Math.random()}`;
plugin.register({ ...action, id: actionId });

// ✅ Correct
plugin.register(action);
plugin.validateInstance(action.type);
```

## Related Documentation

- [TypeSystemPlugin Interface](./plugin-interface.md) - Complete plugin interface
- [GTS Plugin Usage](./gts-plugin.md) - GTS-specific features
- [Vendor Development Guide](./vendor-guide.md) - MFE development guide
- [Example MFE Implementation](./example-mfe.md) - Complete example

## Summary

### Key Principles

1. **Type IDs are opaque** - Call plugin methods, never parse manually
2. **ActionsChain contains instances** - Embed Action objects, not type ID references
3. **Action.type is the entity ID** - No synthetic IDs for actions
4. **ActionsChain has no id field** - Chains are not referenced by ID

### Plugin Methods for Type IDs

- `isValidTypeId()` - Validate format
- `parseTypeId()` - Get metadata
- `isTypeOf()` - Check type hierarchy
- `getAttribute()` - Get attribute values
- `getSchema()` - Get registered schema

### Action Structure

```typescript
{
  action: {        // Action instance
    type: string,  // Action type ID
    target: string,// Target type ID
    payload?: {}, // Optional payload
    timeout?: number // Optional timeout
  },
  next?: ActionsChain,    // Execute on success
  fallback?: ActionsChain // Execute on failure
}
```

Following these principles ensures your MFE integrates correctly with FrontX's type system abstraction and action mediation system.
