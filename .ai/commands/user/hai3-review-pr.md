<!-- @standalone -->
# hai3:review-pr - Review Code Changes

Ask the user for:
1. Files changed (or analyze git diff)
2. Purpose of changes

Then perform comprehensive review:

## 1. ROUTE TO TARGET FILES

Use `.ai/GUIDELINES.md` routing table to identify which target files apply.

## 2. SUMMARIZE APPLICABLE RULES

For each applicable target file, list 3-7 key rules.

## 3. ANALYZE CHANGES

Check for violations in each category:

### Event-Driven Architecture
- [ ] Actions emit events (not direct dispatch)
- [ ] Effects listen to events and update slices
- [ ] No prop drilling or callback state mutation
- [ ] Actions are pure (no getState)
- [ ] Effects update only their own slice

### Import Rules
- [ ] Same package uses relative paths
- [ ] Cross-branch uses @/ alias
- [ ] Cross-package uses @gears-frontx/* names
- [ ] No package internals imported
- [ ] No circular dependencies

### Type Rules
- [ ] No `any` types
- [ ] No `as unknown as` chains
- [ ] String IDs are constants/enums
- [ ] Type for objects, interface for React props

### Styling Rules
- [ ] No hex colors or inline styles
- [ ] Use theme tokens only
- [ ] rem-based units (px only for borders)
- [ ] Configured UI kit components only

### Registry Rules
- [ ] Self-registration used
- [ ] Registry root files unchanged
- [ ] No manual edits to registries

### API Rules
- [ ] Domain-based services (not entity-based)
- [ ] Extends BaseApiService
- [ ] Self-registers via apiRegistry
- [ ] Mocks in app layer

### Screenset Rules
- [ ] Uses the configured UI kit components
- [ ] Slices registered via registerSlice()
- [ ] i18n loader registered
- [ ] All text uses t()
- [ ] IDs defined as constants

## 4. RUN CHECKS

```bash
npm run type-check
npm run lint
npm run arch:check
npm run arch:deps
```

## 5. REPORT

Provide review summary:

### Passes
[List what looks good]

### Warnings
[List potential issues]

### Violations
[List rule violations with file:line references]

### Recommended Fixes
[Provide specific fixes for each violation]

### Checklist Status
[Show checklist completion]

## 6. VERDICT

- **APPROVE**: All checks pass, no violations
- **REQUEST CHANGES**: Violations found, fixes needed
- **COMMENT**: Warnings but no blockers
