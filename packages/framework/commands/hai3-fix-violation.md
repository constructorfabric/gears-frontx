<!-- @standalone -->
# hai3:fix-violation - Fix Rule Violation

## AI WORKFLOW (REQUIRED)
1) Identify: Location (file:line), rule violated, category.
2) Route: Use .ai/GUIDELINES.md to find target file.
3) Summarize: Extract 3-7 applicable rules from target.
4) Fix: Apply correction.
5) Verify: Run checks.
6) Report: What violated, rule applied, changes made, results.

## STEP 1: Identify Violation
- Find violating code location (file:line).
- Classify category: typing | data flow | styling | registry | imports.

## STEP 2: Route to Target File
- Data flow/events -> .ai/targets/EVENTS.md
- API services -> .ai/targets/SCREENSETS.md
- src/screensets -> .ai/targets/SCREENSETS.md
- src/themes -> .ai/targets/THEMES.md
- Styling -> .ai/targets/STYLING.md

## STEP 3: Read and Summarize Rules
- REQUIRED: Read target file before making any change.
- Summarize 3-7 applicable rules internally.

## STEP 4: Apply Fix
Change code to comply with target file rules.

## STEP 5: Verify
Run: npm run arch:check && npm run lint && npm run type-check
REQUIRED: All checks must pass.

## STEP 6: Report
- What violated the rule.
- Which rule was applied.
- Changes made.
- Verification results.

## COMMON FIXES
- Direct dispatch: BAD dispatch(setMenuItems(items)) -> GOOD navigateToScreen(screenId)
- Hardcoded colors: BAD style with inline color -> GOOD className="text-primary"
- Import violations: BAD import from '@gears-frontx/react/src/Foo' -> GOOD import from '@gears-frontx/react'
- String literals: BAD screenId: 'dashboard' -> GOOD export const DASHBOARD_SCREEN_ID = 'dashboard'
- Inline component: Extract to screens/screen/components/ per SCREENSETS.md
- Inline style: BAD style with inline padding -> GOOD className="p-2" (except in components/ui/)
- Inline data: Move to api/domain/mocks.ts, fetch via event-driven flow
