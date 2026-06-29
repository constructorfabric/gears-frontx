<!-- @standalone -->
# frontx:duplicate-screenset - Duplicate Screenset

## AI WORKFLOW (REQUIRED)
1) Read .ai/targets/SCREENSETS.md before starting.
2) Gather requirements from user.
3) Follow steps below.

REQUIRED: Copy folder and update ids.ts only (2 steps, 96% reduction).
REQUIRED: Pass arch:check with zero errors.
REQUIRED: Test via Chrome DevTools MCP (never skip).

## GATHER REQUIREMENTS
Ask user for:
- SOURCE screenset name (existing screenset to copy).
- TARGET screenset name (camelCase, single word preferred).
- TARGET category: Drafts | Mockups | Production.

## STEP 1: Copy Screenset via CLI
```bash
frontx screenset copy SOURCE TARGET --category={category}
```
The CLI automatically:
- Copies all files (screens, slices, actions, events, effects, API, icons, i18n).
- Updates ids.ts with TARGET_SCREENSET_ID and all SCREEN_IDs.
- Everything auto-updates via template literals:
  - Event enums: ${TARGET_SCREENSET_ID}/${DOMAIN_ID}/eventName.
  - Icon IDs: ${TARGET_SCREENSET_ID}:iconName.
  - API domain: ${TARGET_SCREENSET_ID}:serviceName.
  - Redux state key.
- Screenset auto-discovered (no manual registration).

## STEP 2: Validate
```bash
npm run type-check
npm run arch:check
npm run lint
grep -rn "OLD_SCREENSET_ID" src/screensets/TARGET/  # Must return 0 matches
```

## STEP 3: Test via Chrome DevTools MCP
STOP: If MCP connection is broken, fix it first. NEVER skip testing.
- npm run dev.
- Verify TARGET in screenset selector.
- Click TARGET screenset in dev panel.
- Verify URL changes to target screenset.
- Check 0 console errors.
- Test all primary features.
- Verify auto-discovery worked (screenset appears without manual registration).

## CHECKLIST
- [ ] Gather requirements (source, target name, category).
- [ ] Run `frontx screenset copy SOURCE TARGET --category={category}`.
- [ ] Run type-check (MUST pass).
- [ ] Run arch:check (MUST pass).
- [ ] Run lint (MUST pass).
- [ ] Verify zero occurrences of old screenset ID.
- [ ] Test via Chrome DevTools MCP (NEVER skip).
