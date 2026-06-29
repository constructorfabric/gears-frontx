// @cpt-algo:cpt-frontx-algo-studio-devtools-event-routing:p1
// @cpt-dod:cpt-frontx-dod-studio-devtools-persistence:p1
import type { Position, Size } from '../types';

/**
 * Studio UI Event Payloads
 * These events track changes to Studio UI state (position, size, visibility)
 */

export interface PositionChangedPayload {
  position: Position;
}

export interface SizeChangedPayload {
  size: Size;
}

export interface ButtonPositionChangedPayload {
  position: Position;
}

/**
 * Studio Event Names
 * Namespace: studio/
 */
export const StudioEvents = {
  PositionChanged: 'studio/positionChanged',
  SizeChanged: 'studio/sizeChanged',
  ButtonPositionChanged: 'studio/buttonPositionChanged',
} as const;

/**
 * Module Augmentation
 * Extend EventPayloadMap from @gears-frontx/state for type safety
 */
declare module '@gears-frontx/state' {
  interface EventPayloadMap {
    'studio/positionChanged': PositionChangedPayload;
    'studio/sizeChanged': SizeChangedPayload;
    'studio/buttonPositionChanged': ButtonPositionChangedPayload;
  }
}
