# @gears-frontx/studio

Development tools overlay for HAI3 applications providing runtime controls and debugging capabilities.

## Overview

`@gears-frontx/studio` delivers a comprehensive development environment overlay that enables real-time application control without code changes. The package provides visual controls for theme switching, screen navigation, language testing, and API mode toggling, all accessible through a draggable, resizable panel that automatically tree-shakes out of production builds.

## Purpose

This package accelerates development and QA workflows by providing instant access to application configuration without stopping the dev server or editing code. Studio enables rapid theme iteration, internationalization testing across 36 languages, screen navigation for UI review, and seamless switching between mock and real API implementations.

## Key Capabilities

### Runtime Configuration

Modify application state through an intuitive visual interface. Changes take effect immediately without page reloads, enabling fast iteration cycles. All configuration state persists across browser sessions through localStorage.

### Theme Development

Preview all registered themes instantly with a dedicated theme selector. Current theme highlights automatically, and theme changes propagate through the entire application via the framework's theme system.

### Navigation Control

Browse all available screens organized by screenset category (Drafts, Mockups, Production). Click any screen to navigate immediately, making it easy to review UI implementations across the entire application.

### Internationalization Testing

Validate translations across 36 supported languages without modifying code. The language selector shows all available languages with native names, and changes apply immediately to all localized content.

### API Mode Switching

Toggle between mock and real API implementations at runtime. This enables frontend development without backend dependencies and facilitates comprehensive testing scenarios without modifying service code.

## Interface Features

### Draggable Panel

Position the studio panel anywhere on screen through drag-and-drop. Click and hold the header to drag. Position state saves automatically to localStorage and restores on page reload.

### Resizable Interface

Adjust panel dimensions by dragging the bottom-right corner. Minimum size: 320×400px. Maximum size: 600×800px. Size preferences persist across sessions.

### Collapsible Design

Minimize the panel to a circular button in the bottom-right corner when screen space is limited. Click to expand back to full panel. Collapsed state persists across page reloads.

### Keyboard Shortcuts

- **Shift + `** (tilde) - Toggle studio panel visibility on all platforms

## Integration

### Automatic Loading (Recommended)

HAI3Provider automatically detects studio package installation and loads it in development mode only. No explicit imports or configuration required - install the package and it activates automatically in development.

### Manual Integration (Advanced)

For custom loading scenarios, import the StudioOverlay component directly and conditionally render based on environment. Useful when implementing custom development mode detection or build-time environment variables.

## Production Safety

### Tree-Shaking

Studio code automatically eliminates from production bundles through conditional imports. HAI3Provider uses lazy loading with environment checks to ensure zero studio code reaches production.

### Bundle Verification

After production builds, studio adds 0 bytes to bundle size. No studio code appears in the dist/assets directory. The framework's conditional import pattern guarantees complete code elimination.

## Technical Architecture

### Event-Driven State

Studio integrates with HAI3's event bus for all state changes. Position, size, and configuration updates emit events that persistence effects subscribe to. This maintains loose coupling with the framework core.

### Localization System

Studio translations register automatically at module import time. All 36 language files lazy-load on demand - only the current language downloads. Translation keys use the standard framework namespacing pattern.

### Self-Contained Implementation

The package imports UI components directly from UI Kit rather than using the component registry. This ensures studio functions independently and doesn't interfere with application component registrations.

## Installation

```bash
npm install --save-dev @gears-frontx/studio
```

Install as a devDependency rather than a regular dependency to reinforce its development-only nature.

## Supported Languages

Studio provides full localization for 36 languages including English, Spanish, French, German, Italian, Portuguese, Russian, Chinese (Simplified & Traditional), Japanese, Korean, Arabic, Hindi, Bengali, Turkish, Vietnamese, Thai, and 20 additional languages.

## Peer Dependencies

Requires the following packages:

- `@gears-frontx/uicore` - Core framework for state management and events
- `react` ^19.2.4 - React library
- `react-dom` ^19.2.4 - React DOM renderer

## Browser Compatibility

- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)

## TypeScript Support

Fully typed with exported type definitions for Position, Size, and StudioState. Includes module augmentation for integrating with the framework's type system.

## Version

**Alpha Release** (`0.1.0-alpha.0`) - APIs may change before stable release.

## License

Apache-2.0

## Related Packages

- [`@gears-frontx/uicore`](../uicore) - Core layout and state management

## Contributing

Studio is part of the Gears FrontX Monorepo. See the main repository for contribution guidelines and development setup instructions.
