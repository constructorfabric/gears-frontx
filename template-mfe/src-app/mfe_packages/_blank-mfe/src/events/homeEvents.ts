/**
 * Home Domain - Events
 * Every event an action emits is declared here. Fill this file for every screen that
 * has behavior; the augmentation below is what types the action/effect pair.
 * Follow the mfe/<domain>/<event-name> naming convention (past tense).
 *
 * Uncomment the module augmentation below and add your event types:
 *
 * declare module '@gears-frontx/react' {
 *   interface EventPayloadMap {
 *     'mfe/home/data-fetch-requested': undefined;
 *   }
 * }
 */

/*
 * This file has to keep at least one top-level `import` or `export`, and the
 * `export {}` below is it until a real one arrives. Without one TypeScript
 * reads the file as a script rather than a module, and a `declare module
 * '@gears-frontx/react'` written inside a script REPLACES that module's
 * declarations instead of augmenting them: every other import from
 * `@gears-frontx/react` in the package — `createSlice`, `eventBus`,
 * `ChildMfeBridge` — then fails with TS2305 "has no exported member", pointing
 * at the importing file rather than at this one.
 */
export {};
