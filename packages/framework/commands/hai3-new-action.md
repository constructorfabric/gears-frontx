<!-- @standalone -->
# hai3:new-action - Create New Action

## AI WORKFLOW (REQUIRED)
1) Read .ai/targets/EVENTS.md before starting.
2) Summarize 3-6 key rules.
3) Gather requirements from user.
4) Implement.

## GATHER REQUIREMENTS
Ask user for:
- Action purpose (e.g., "navigate to screen", "load user data").
- Which screenset and domain (e.g., "chat/threads", "demo/navigation").
- Event payload data.

## STEP 1: Implementation

### 1.1 Define Event
In src/screensets/{screenset}/events/{domain}Events.ts:
```typescript
import { SCREENSET_ID } from '../ids';

const DOMAIN_ID = '{domain}';

export const {Domain}Events = {
  {EventName}: `${SCREENSET_ID}/${DOMAIN_ID}/{eventName}` as const,
} as const;

export type {EventName}Payload = {
  // payload fields
};

declare module '@gears-frontx/state' {
  interface EventPayloadMap {
    [{Domain}Events.{EventName}]: {EventName}Payload;
  }
}
```

### 1.2 Create Action
In src/screensets/{screenset}/actions/{domain}Actions.ts:
```typescript
import { eventBus } from '@gears-frontx/state';
import { {Domain}Events } from '../events/{domain}Events';

export const {actionName} = (params: ParamsType) => {
  return (): void => {
    eventBus.emit({Domain}Events.{EventName}, {
      // payload
    });
  };
};
```

### 1.3 Create Effect
In src/screensets/{screenset}/effects/{domain}Effects.ts:
```typescript
import { eventBus, getStore } from '@gears-frontx/state';
import { {Domain}Events } from '../events/{domain}Events';

export function init{Domain}Effects(): void {
  const store = getStore();
  eventBus.on({Domain}Events.{EventName}, (payload) => {
    store.dispatch(set{Something}(payload.{field}));
  });
}
```

### 1.4 Validate
```bash
npm run arch:check
```

## RULES
- Actions use imperative names (selectScreen, changeTheme).
- Events use past-tense names (screenSelected, themeChanged).
- Actions are pure functions (no getState, no async thunks).
- Actions return void (not Promise).
- Effects update their own slice only.
- Cross-domain communication only via events.
- FORBIDDEN: Direct slice dispatch from actions/components.
