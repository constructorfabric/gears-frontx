<!-- @standalone -->
# Event-Driven Architecture (Canonical)

## AI WORKFLOW (REQUIRED)
1) Summarize 3-6 rules from this file before making changes.
2) STOP if you add direct slice dispatch, prop drilling, or callback-based mutation.

## CRITICAL RULES
- Data flow is fixed: Component -> Action -> Event -> Effect -> Slice -> Store.
- Actions emit events only; effects update their own slice only.
- Cross-domain communication is allowed only via events.
- Direct slice dispatch, prop drilling, and callback state mutation are FORBIDDEN.

## ACTIONS
- Pure functions; cannot access store state (no getState).
- Emit events through event bus; may compose other actions.
- Must return void; no Promise-returning thunks.
- REQUIRED: Fire-and-forget async using then/catch (no await).
- REQUIRED: Use void operator when ignoring async results.
- FORBIDDEN: async keyword on actions.
- FORBIDDEN: Direct slice dispatch from actions.

## EFFECTS
- Subscribe to events.
- Update only their own slice.
- No business logic.
- May not call actions (prevents loops).
- May read store state but must handle initial state.

## EVENT NAMING
- Events use past-tense names.
- Screenset format: "screensetId/domainId/eventName".
- UICORE format: "uicore/domainId/eventName".
- Actions use imperative names; events use past-tense names.

## DOMAIN FILE STRUCTURE
- REQUIRED: Split events into domain files (one file per domain).
- REQUIRED: Each domain file defines local DOMAIN_ID.
- REQUIRED: Use template literals for keys: ${SCREENSET_ID}/${DOMAIN_ID}/eventName.
- FORBIDDEN: Barrel exports in events folders.
- FORBIDDEN: Coordinator effects files.
- DETECT: grep -rn "events/index" src/screensets

## EFFECTS STRUCTURE
- REQUIRED: Split effects into domain files; each slice registers its own effects.
- FORBIDDEN: Single coordinator effects file.
- FORBIDDEN: Barrel exports in effects folders.
- DETECT: grep -rn "effects/index" src/screensets
- DETECT: grep -rn "chatEffects\\|demoEffects" src/screensets

## EVENTS VS STATE SLICES
- Events describe what happened.
- Slices organize state.
- Effects bridge events -> slice updates.
- No requirement for 1:1 event-to-slice pairing.

## TYPE SAFETY
- No explicit generic parameters on emit.
- Every key must exist in EventPayloadMap.
- One payload type per event key.

## FILE LOCATION RULES
- Each feature owns its events, actions, slices, and effects.
- No global core events unless shared across packages.
- Each domain initializes its own effects when its slice is registered.

## DETECTION RULES
- Direct slice dispatch:
  grep -R "dispatch(set[A-Z])" src packages
- Cross-domain slice import:
  grep -R "import .*Slice .* from" src packages
- Store access in actions:
  grep -R "getState.*app\\.|getState\\(\\).*\\." src "*Actions.ts"

## MFE RUNTIME ISOLATION
- Each MFE gets its own isolated instances of @gears-frontx/react even when listed in sharedDependencies.
- `singleton: false` (the default for MfeHandlerMF) causes the federation runtime to evaluate the shared code independently per MFE. Shared code is downloaded once but evaluated per MFE, so module-level singletons (eventBus, apiRegistry, store) are independent per MFE.
- This gives each MFE its own isolated eventBus, apiRegistry, and store singletons.
- MFE-internal events never cross runtime boundaries.
- Host eventBus and MFE eventBus are completely separate instances.
- FORBIDDEN: Emitting events intended for a different runtime.
- FORBIDDEN: Subscribing to events from a different runtime (impossible by design).

## CROSS-RUNTIME COMMUNICATION
- Host <-> MFE communication is ONLY via shared properties and actions chains.
- Shared properties: host sets domain properties, MFE reads via bridge.subscribeToProperty().
- Actions chains: MFE calls bridge.executeActionsChain() to invoke host-side actions.
- FORBIDDEN: Data proxying (MFE fetches data then forwards to host via events/bridge).
- FORBIDDEN: Cross-runtime event emission (each runtime has its own eventBus).
- Each runtime independently fetches all data it needs from its own API services.

## MFE EVENT NAMING
- MFE-internal events use format: mfe/<domain>/<eventName>.
- Host events use format: app/<domain>/<eventName> or screensetId/domainId/eventName.
- The mfe/ prefix distinguishes MFE-internal events from host events.
- This is a naming convention only — events are isolated by design (separate eventBus instances).
- Examples: mfe/profile/user-fetch-requested, mfe/profile/user-fetched, mfe/profile/user-fetch-failed.
