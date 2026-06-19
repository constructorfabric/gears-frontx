<!-- @standalone -->
# hai3:new-component - Add New UI Component

## AI WORKFLOW (REQUIRED)
1) Check for existing equivalent in project (e.g. components/ui/) and configured UI library first.
2) Gather requirements from user.
3) Implement.

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
Run: npm run arch:check && npm run dev
Test component in UI.

## RULES
- REQUIRED: Check existing project UI components first; create new only if missing.
- FORBIDDEN: Redux, business logic, side effects in components.
- FORBIDDEN: Inline styles outside components/ui/.
- REQUIRED: Accept value/onChange pattern for state.
