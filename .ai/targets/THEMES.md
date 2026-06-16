<!-- @standalone:override -->
# Theme Guidelines

## AI WORKFLOW (REQUIRED)
1) Summarize 3-5 rules from this file before proposing changes.
2) STOP if you modify theme objects outside the designated theme locations.

## SCOPE
- Theme objects and theme registration in packages and app code.
- Theme type definitions are exported from @gears-frontx/framework.

## CRITICAL RULES
- Theme objects are the single source of truth; no standalone CSS variables.
- Theme shape MUST match the Theme interface from @gears-frontx/framework.
- Apps define themes in src/themes/**; screensets must not modify themes.
- Theme registration MUST use app.themeRegistry.register(themeConfig).
- FORBIDDEN: themeRegistry.register(id, theme) and createHAI3App({ themes: { applyFn } }).
- Themes must support light and dark variants, use rem units, and meet WCAG contrast >= 4.5:1.

## STOP CONDITIONS
- Editing theme values inside screensets or feature modules.
- Adding CSS variables that do not exist in the Theme interface.
- Changing the Theme interface without a version bump in @gears-frontx/framework.

## PRE-DIFF CHECKLIST
- [ ] Theme object matches contract exactly.
- [ ] No hex colors or CSS variables defined outside theme objects.
- [ ] Light and dark variants exist.
- [ ] Contrast ratio >= 4.5:1 verified.
