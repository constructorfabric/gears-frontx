
# @gears-frontx/state Guidelines (Canonical)

## AI WORKFLOW (REQUIRED)
1) Summarize 3-6 rules from this file before making changes.
2) STOP if you add direct reducer configuration or bypass registerSlice.

## SCOPE
- Package: `packages/state/` (part of the unified Flux dataflow pattern)
- Layer: L1 SDK (zero @gears-frontx dependencies)
- Peer dependency: `@reduxjs/toolkit`

> **Note:** @gears-frontx/state consolidates the former @gears-frontx/events and @gears-frontx/store packages into a single unified Flux dataflow package.

## CRITICAL RULES
- Dynamic slice registration via `registerSlice()` (not manual configureStore).
- Slice naming: `${screensetId}/${domain}` (e.g., `chat/threads`).
- Effects initialize when slice registers (pass initializer to registerSlice).
- Type safety via module augmentation on `RootState`.
- One store instance via `createStore()` singleton.

## SLICE NAMING CONVENTION
- REQUIRED: Use template literal with screenset ID: `${SCREENSET_ID}/domain`.
- REQUIRED: Slice `.name` must match the state key exactly.
- FORBIDDEN: Hardcoded string slice names.
- FORBIDDEN: Global/shared slices outside layout domains.

## SLICE REGISTRATION
```typescript
// GOOD: Dynamic registration with effects
const SLICE_KEY = `${CHAT_SCREENSET_ID}/threads` as const;
const threadsSlice = createSlice({ name: SLICE_KEY, ... });
registerSlice(threadsSlice, initializeThreadsEffects);

// BAD: Manual reducer configuration
configureStore({ reducer: { threads: threadsSlice.reducer } }); // FORBIDDEN
```

## MODULE AUGMENTATION
```typescript
// REQUIRED: Type-safe state access
declare module '@gears-frontx/state' {
  interface RootState {
    [SLICE_KEY]: ThreadsState;
  }
}
```

## STOP CONDITIONS
- Editing `createStore()` implementation.
- Bypassing `registerSlice()` for manual reducer injection.
- Creating global slices (except layout domains in @gears-frontx/framework).
- Hardcoding slice names without screenset ID prefix.

## PRE-DIFF CHECKLIST
- [ ] Slice name uses template literal with SCREENSET_ID.
- [ ] RootState augmented for type safety.
- [ ] Effects passed to registerSlice (not initialized separately).
- [ ] No direct configureStore usage in app code.
