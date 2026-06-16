# @gears-frontx/studio

FrontX Studio overlay package for runtime inspection and control of MFE applications.

## Studio Layer

This package is part of the **Studio Layer (L4)** - it provides developer tooling for inspecting and controlling FrontX applications at runtime.

## What This Package Contains

| Export | Description |
|--------|-------------|
| `StudioOverlay` | Main overlay component with collapsible panel |
| `ControlPanel` | Control panel with selectors and toggles |
| `MfePackageSelector` | Dropdown selector for switching between registered GTS packages |
| `ThemeSelector` | Dropdown selector for theme switching |
| `LanguageSelector` | Dropdown selector for language switching |
| `ApiModeToggle` | Toggle switch for API mode (mock/live) |
| `StudioProvider` | Context provider for studio configuration |

## Components

### MfePackageSelector

Displays a dropdown of registered GTS packages and allows switching between them by mounting the first screen extension of the selected package.

```tsx
import { MfePackageSelector } from '@gears-frontx/studio';

function ControlPanel() {
  return (
    <div>
      <MfePackageSelector />
    </div>
  );
}
```

**Behavior:**
- Subscribes to registered packages via `useRegisteredPackages()`
- Subscribes to the active package via `useActivePackage()`
- Disabled when only one package is registered
- On package change: finds all screen extensions for the package, sorts by `presentation.order`, and mounts the first one
- Uses `registry.executeActionsChain()` with `HAI3_ACTION_MOUNT_EXT` to mount the extension

### ThemeSelector

Dropdown for switching themes. Subscribes to available themes and the current theme, and calls the theme setter on change.

### LanguageSelector

Dropdown for switching languages. Subscribes to available languages and the current language, and calls the language setter on change.

### ApiModeToggle

Toggle switch for switching between mock and live API modes. Uses `useApiMode()` hook to read/write the API mode.

## Key Rules

1. **Developer tooling only** - Studio is for development inspection, not production features
2. **Overlay pattern** - Studio renders as a fixed overlay on top of the application
3. **React-only** - Studio is built with React and depends on `@gears-frontx/react` hooks
4. **No direct state mutation** - All state changes go through registry and hooks
