<!-- @standalone -->
# frontx:new-component - Add New UI Component

## AI WORKFLOW (REQUIRED)
1) Read `.ai/project/GUIDELINES.md` and `.ai/project/targets/UNIT_TESTING.md` when they exist **before** any unit-test, validation, or testing steps in this command (project-owned overrides take precedence over defaults here).
2) Check for existing equivalent in project (e.g. components/ui/) and configured UI library first.
3) Gather requirements from user.
4) Implement.

## CHECK EXISTING COMPONENTS FIRST
- REQUIRED: Read `frontx.config.json` to find the `uikit` value.
- If uikit is a third-party package (not `shadcn` or `none`): read its exports from `node_modules/<package>/` to check for existing components.
- REQUIRED: Before creating a new component, scan the project AND the configured UI library for existing equivalents.
- REQUIRED: Reuse existing components if equivalent exists.

## GATHER REQUIREMENTS
Ask user for:
- Component name (e.g., "DataTable", "ColorPicker").
- Component description and props.

## IF SCREENSET COMPONENT

### STEP 0: Determine Subfolder
- components/ui/: Base UI primitives (shadcn components or custom).
- screens/{screen}/components/: Screen-specific components.
- components/: Shared composites used across screens.

### STEP 1: Implementation

#### 1.1 Create Component
File: src/components/ui/{ComponentName}.tsx (base primitives)
  or: src/screens/{screen}/components/{ComponentName}.tsx (screen-specific)
  or: src/components/{ComponentName}.tsx (shared composites)
- Must be reusable within the MFE.
- NO Redux or state management.
- Accept value/onChange pattern for state.

#### 1.2 Export
Export from local index if needed.

#### 1.3 Validation
<!-- @cpt-begin:cpt-frontx-flow-unit-test-generation-and-agent-verification-agent-verify:p1:inst-agent-implement-and-test -->
If creating a shared composite in `src/components/`, add or update a component test for its stable behavior.
Run `npm run test:unit`, `npm run type-check`, `npm run arch:check`, and `npm run dev` (or the equivalent commands for this project's configured package manager) and apply any stricter triggers or conventions from `.ai/project/targets/UNIT_TESTING.md`. Apply constraints from workflow step 1.
<!-- @cpt-end:cpt-frontx-flow-unit-test-generation-and-agent-verification-agent-verify:p1:inst-agent-implement-and-test -->
Test component in UI.

## TESTING
- REQUIRED: Load `.ai/project/GUIDELINES.md` and `.ai/project/targets/UNIT_TESTING.md` when they exist **before** interpreting unit-test requirements elsewhere in this command.
- REQUIRED: Follow `.ai/project/targets/UNIT_TESTING.md` for `__test-utils__/` placement and durable, non-placeholder assertions when adding or updating tests.

## RULES
- REQUIRED: Check existing project UI components first; create new only if missing.
- FORBIDDEN: Redux, business logic, side effects in components.
- FORBIDDEN: Inline styles outside components/ui/.
- REQUIRED: Accept value/onChange pattern for state.
- REQUIRED: New shared composite components in `src/components/` include a colocated or nearby unit test when the behavior is stable.
