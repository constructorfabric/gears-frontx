<!-- @standalone -->
# frontx:quick-ref - Quick Reference

## Event-Driven
- REQUIRED: Action emits event via eventBus.emit('event/name', payload).
- REQUIRED: Effect subscribes via eventBus.on('event/name', handler).
- REQUIRED: Effect updates slice via store.dispatch(setSlice(data)).
- FORBIDDEN: Direct slice dispatch from actions or components.

## Imports
- Same package: BAD import from internal paths (e.g. package/src/Foo) -> GOOD import from './Foo' or package root.
- Cross-branch app: BAD import from '../../core/layout' -> GOOD import from '@/core/layout'.
- Cross-package: use local components; avoid importing from deprecated shared UI packages.

## Components
- REQUIRED: Use local UI (MFE `components/ui/`, screen `components/`).
- App/screensets: Use local components for UI.
- FORBIDDEN: Raw HTML elements for UI.
- FORBIDDEN: Inline component definitions in *Screen.tsx.

## Component Placement
- REQUIRED: components/ui/ for base UI primitives (shadcn or custom).
- REQUIRED: components/ for shared composites used across screens.
- REQUIRED: screens/{screen}/components/ for screen-specific components.
- REQUIRED: Screen files orchestrate components only.

## Registry
- REQUIRED: class MyService extends BaseApiService.
- REQUIRED: apiRegistry.register(MyService).

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
- REQUIRED: App deps limited to @gears-frontx/react, react, react-dom (use local UI).
- REQUIRED: Cross-domain communication via events only.
- FORBIDDEN: String literals for IDs.
- FORBIDDEN: any type or unsafe casts.

## Docs
- .ai/GUIDELINES.md -> Routing table.
- .ai/targets/*.md -> Area-specific rules.
