<!-- @standalone -->
# hai3:new-component - Add New UI Component

## AI WORKFLOW (REQUIRED)
1) Read `frontx.config.json` at project root to identify the configured `uikit` value.
2) Check if the configured UI kit or existing project components cover the need (see CHECK EXISTING COMPONENTS).
3) Gather requirements from user.
4) Confirm implementation plan with user.
5) Apply implementation directly.

## CHECK EXISTING COMPONENTS FIRST
- REQUIRED: Read `frontx.config.json` to find the `uikit` value.
- If uikit is a third-party package (not `shadcn` or `none`): read its exports from `node_modules/<package>/` to check for existing components.
- REQUIRED: Before creating a new component, scan the project AND the configured UI library for existing equivalents.
- REQUIRED: Reuse existing components if equivalent exists.

## GATHER REQUIREMENTS
Ask user for:
- Component name (e.g., "DataTable", "ColorPicker").
- Component description and props.

## STEP 1: Confirm Plan
Confirm with user:
- MFE/screenset name, component name, and placement.
- Props contract and expected behavior.

## STEP 2: Apply Implementation

### 2.1 Create Component
File: src/components/ui/{ComponentName}.tsx (for shadcn/base components)
  or: src/screens/{screen}/components/{ComponentName}.tsx (for screen-specific components)
  or: src/components/{ComponentName}.tsx (for shared composites)
- Must be reusable within the MFE.
- NO Redux or state management.
- Accept value/onChange pattern for state.

### 2.2 Export
Export from local index if needed.

### 2.3 Validation
Run: npm run arch:check && npm run dev
Test component in UI.

## RULES
- REQUIRED: Check configured UI kit and existing project components first; create new only if missing.
- FORBIDDEN: Redux, business logic, side effects in components.
- FORBIDDEN: Inline styles outside components/ui/.
- REQUIRED: Accept value/onChange pattern for state.
