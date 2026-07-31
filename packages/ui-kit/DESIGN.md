# UI Kit — Design

Status: in development (MVP)
Repo-doc only, not published with the package. Backing CDSL artifacts (PRD
requirement, DESIGN component, FEATURE) are planned; until they land the
package is covered by an `[[ignore]]` entry in `.cf-studio/config/artifacts.toml`
(same interim state as `@gears-frontx/telemetry`).

> **History.** The kit was designed and prototyped in the now-retired gears-web
> repository (issue gears-web#7): first as a shadcn-style source registry, then
> as an npm package, with the styling stack settled by the architects as
> **CSS Modules instead of Tailwind** and **Base UI instead of Radix**. The
> tsup + CSS Modules pipeline and the Button prototype were proven there and
> moved here as gears-web was decommissioned. Where published runtime libraries
> live in the FrontX architecture is tracked by #495.

## Problem

Front-end templates in the Constructor Fabric ecosystem — from which FrontX and
Studio assemble interfaces — each build their UI layer from scratch. There is no
standard component base for templates, and nothing AI agents can rely on to
generate screens consistently.

## Goals

- A curated set of React components covering a typical admin application.
- The **standard component base for FrontX templates**: one version everywhere,
  fixes and design updates propagate via a dependency bump.
- Self-contained styling: the package ships its own compiled CSS; consumers
  need no CSS framework, preprocessor, or build plugins.
- AI-ready: agents generate screens from the kit using its bundled docs.
- Curate, don't write: behavior comes from Base UI (headless, tested upstream);
  styles are authored as CSS Modules, translated from shadcn/ui's design.

## Non-goals (MVP)

- White-label theming APIs. Basic branding = overriding CSS-variable tokens;
  deep customization = fork the kit or build the template on another kit.
- Framework-agnostic components (React is a hard requirement).
- `data-table`, date-picker, charts, page layout templates, form validation
  integration (RHF/zod), i18n helpers, Storybook.

## Architecture

- Component stack: **React 19 + Base UI (`@base-ui/react`) + CSS Modules + CVA**.
- Build: **tsup** (`cjs`+`esm`+dts), matching the sibling ecosystem packages.
  Key constraint: tsup has no CSS Modules support of its own — the esbuild
  `local-css` loader override in `tsup.config.ts` provides it, relying on the
  convention that JS imports only `*.module.css` (see the comment there).
- CSS pipeline: per-component `*.module.css`; the bundler inlines hashed
  class-name maps into JS and extracts all CSS into `dist/index.css`
  (`./styles.css` export). Design tokens are a plain-CSS file
  (`./theme.css` export). A consumer imports both once. No PostCSS/Tailwind
  requirements on either side.
- Theme: semantic CSS variables (colors, radii), light/dark via `data-theme` /
  `prefers-color-scheme`; neutral shadcn-style visual base. Component CSS
  consumes only these variables — the theme file is the single seam between
  kit styles and consumer brand.
- Publishing: version-gated like every ecosystem package. `private: true`
  remains in place until both the MVP component set lands and #495 approves
  the package's architecture ownership, traceability, and version policy. The
  required CDSL artifacts must then replace the temporary `artifacts.toml`
  ignore. Only after all of those gates pass is flipping `private` the release
  act.

## Component set (MVP, ~18 components)

| Group    | Components |
|----------|------------|
| Forms    | `button`, `input`, `textarea`, `select`, `checkbox`, `radio-group`, `switch`, `label`, `field` |
| Overlays | `dialog`, `dropdown-menu`, `tooltip`, `toast` (sonner) |
| Structure| `card`, `tabs`, `badge`, `separator`, `skeleton` |
| Data     | `table` (primitive markup) |

Behavior and accessibility come from Base UI primitives; variant logic is CVA;
styles are CSS Modules translated from shadcn/ui's Tailwind design (MIT,
attribution in this package's NOTICE). Wrapping conventions follow Constructor's
internal react-kit (gitlab.constr.dev/frontend/react-kit): per-component
directories, colocated tests and docs, `render`-prop polymorphism. A composite
`data-table` is deliberately deferred.

## AI layer (planned)

`llms.txt` + a short usage doc per component (when to use, anti-patterns,
composition examples) shipped in the package; three composition recipes (CRUD
page, settings form, confirmation dialog).

## Testing and acceptance

- Unit tests are written along with components: render + interaction smoke per
  component (vitest + jsdom + testing-library, versions pinned by the root
  test-dependency gate).
- Kitchen-sink demo app (planned, `packages/ui-kit-example-web` following the
  telemetry example pattern): every component in every state; live smoke and
  the agent playground.
- Acceptance: (1) `scripts/verify-consumer.sh` packs the package, installs the
  tarball into a clean Vite project, builds a page and asserts tokens, styles,
  and class maps in the bundle; (2) an agent assembles a CRUD screen from kit
  components from a single prompt using the bundled docs.

## Risks

1. The kit dictates React for consumers — acceptable for ecosystem templates.
2. Fork is the only deep-customization path — accepted; the standard optimizes
   for consistency across templates.
3. Authored styles replace curated styles — the largest share of MVP effort and
   where visual bugs will live; the kitchen-sink demo exists to catch them.

## Delivery plan

1. Package skeleton + proven tsup/CSS Modules pipeline + Button (this step).
2. Tokens polish + first component batch (forms) on `@base-ui/react`.
3. Remaining components.
4. AI docs + kitchen-sink example app; satisfy the #495 publication gates,
   remove the temporary artifact ignore, then flip `private` and publish.
