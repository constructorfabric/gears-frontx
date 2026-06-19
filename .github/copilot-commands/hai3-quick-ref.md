<!-- @standalone -->
# hai3:quick-ref - Quick Reference

## Event-Driven
- REQUIRED: Action emits event via eventBus.emit('event/name', payload).
- REQUIRED: Effect subscribes via eventBus.on('event/name', handler).
- REQUIRED: Effect updates slice via store.dispatch(setSlice(data)).
- FORBIDDEN: Direct slice dispatch from actions or components.

## Imports
- Same package: BAD import from '../src/Foo' -> GOOD import from './Foo'.
- Cross-branch app: BAD import from '../../core/layout' -> GOOD import from '@/core/layout'.
- Cross-package: BAD import from '@gears-frontx/react/src/internal' -> GOOD import from '@gears-frontx/react'.

## Components
- REQUIRED: Check existing UI components (components/ui/) first; create new only if missing.
- REQUIRED: Use project's UI components for common controls (buttons, inputs, dialogs, etc.).
- FORBIDDEN: Raw HTML elements for UI.
- FORBIDDEN: Inline component definitions in *Screen.tsx.

## Component Placement
- REQUIRED: components/ui/ for base UI primitives (shadcn or custom).
- REQUIRED: components/ for shared composites used across screens.
- REQUIRED: screens/{screen}/components/ for screen-specific components.
- REQUIRED: Screen files orchestrate components only.

## Registry
- REQUIRED: export const MY_DOMAIN = 'my-domain'.
- REQUIRED: class MyService extends BaseApiService.
- REQUIRED: declare module '@gears-frontx/api' { interface ApiServicesMap }.
- REQUIRED: apiRegistry.register(MY_DOMAIN, MyService).

## Styling
- Inline styles ONLY in components/ui/ (base primitives).
- BAD style={{ backgroundColor: '#fff' }} -> GOOD className="bg-background".
- BAD style={{ color: '#000' }} -> GOOD className="text-foreground".
- REQUIRED: Use Tailwind utilities, CSS variables elsewhere.

## i18n
- REQUIRED: i18nRegistry.registerLoader('screenset.demo', loader).
- REQUIRED: Use t('screenset.demo:screens.home.title') format.
- FORBIDDEN: Hardcoded strings in UI.

## Commands
- npm ci -> Install dependencies.
- npm run dev -> Start dev server.
- npm run arch:check -> Validate (CRITICAL before commits).
- npm run type-check -> TypeScript validation.
- npm run lint -> ESLint validation.

## Invariants
- REQUIRED: Event-driven architecture only.
- REQUIRED: Registries follow Open/Closed principle.
- REQUIRED: App deps limited to @gears-frontx/react, react, react-dom.
- REQUIRED: Cross-domain communication via events only.
- FORBIDDEN: String literals for IDs.
- FORBIDDEN: any type or unsafe casts.

## Docs
- .ai/GUIDELINES.md -> Routing table.
- .ai/targets/*.md -> Area-specific rules.
