
# @gears-frontx/framework Guidelines (Canonical)

## AI WORKFLOW (REQUIRED)
1) Summarize 3-6 rules from this file before making changes.
2) STOP if you modify core plugins or bypass plugin architecture.

## SCOPE
- Package: `packages/framework/`
- Layer: L2 Framework (depends on all L1 SDK packages)
- Peer dependencies: `@gears-frontx/state`, `@gears-frontx/screensets`, `@gears-frontx/api`, `@gears-frontx/i18n`

## CRITICAL RULES
- Applications built by composing plugins via `createHAI3().use()`.
- Use presets for common configurations (full, minimal, headless).
- Access registries and actions through app instance.
- NO React code in this package (React bindings in @gears-frontx/react).
- Plugin dependencies auto-resolved (order doesn't matter).

## PLUGIN COMPOSITION
```typescript
// GOOD: Compose plugins
const app = createHAI3()
  .use(screensets())
  .use(themes())
  .use(layout())
  .use(navigation())
  .use(i18n())
  .build();

// GOOD: Use preset shorthand
const app = createHAI3App(); // Full preset

// BAD: Manual configuration without plugins
const store = configureStore({ ... }); // FORBIDDEN
```

## AVAILABLE PLUGINS

| Plugin | Provides | Dependencies |
|--------|----------|--------------|
| `screensets()` | screensetRegistry, screenSlice | - |
| `themes()` | themeRegistry, changeTheme | - |
| `layout()` | All layout domain slices | screensets |
| `navigation()` | navigateToScreen, navigateToScreenset | screensets, routing |
| `routing()` | routeRegistry, URL sync | screensets |
| `i18n()` | i18nRegistry, setLanguage | - |
| `effects()` | Core effect coordination | - |

## CUSTOM PLUGINS
```typescript
// GOOD: Follow plugin contract
export function myPlugin(): HAI3Plugin {
  return {
    name: 'my-plugin',
    dependencies: ['screensets'],
    provides: {
      registries: { myRegistry: createMyRegistry() },
      slices: [mySlice],
      effects: [initMyEffects],
      actions: { myAction: myActionHandler },  // Handwritten action function
    },
    onInit(app) { /* Initialize */ },
    onDestroy(app) { /* Cleanup */ },
  };
}
```

**NOTE:** Actions are handwritten functions in screensets that contain business logic and emit events via `eventBus.emit()`. The SDK does NOT export a `createAction` helper.

## STOP CONDITIONS
- Adding React components to this package.
- Modifying core plugin implementations.
- Bypassing plugin architecture for manual setup.
- Creating direct dependencies between plugins.

## PRE-DIFF CHECKLIST
- [ ] Using plugin composition (not manual setup).
- [ ] Custom plugins follow HAI3Plugin contract.
- [ ] Plugin dependencies declared (not implicit).
- [ ] No React code in framework package.
