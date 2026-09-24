// @cpt-flow:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1
// @cpt-algo:cpt-frontx-calendar-kit-algo-week-grid-mode-gating:p1
// @cpt-algo:cpt-frontx-calendar-kit-algo-week-grid-paint-range:p1
// @cpt-algo:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1
// @cpt-state:cpt-frontx-calendar-kit-state-week-grid-interaction-mode:p2
// @cpt-state:cpt-frontx-calendar-kit-state-week-grid-pending-move:p2
// @cpt-dod:cpt-frontx-calendar-kit-dod-week-grid-mode-callbacks:p1
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import { isEventActionable } from "../../core/actionability";
import {
  buildSelectionRange,
  createInteractionState,
  transitionInteraction,
} from "../../core/interactions";
import type {
  InteractionAction,
  InteractionState,
  PendingMove,
} from "../../core/interactions";
import type {
  CalendarCell,
  CalendarEvent,
  CalendarMoveRequest,
  CalendarSelectionRange,
  WeekGridInteractionMode,
} from "../../core/model";
import type { CalendarQuickCreatePayload } from "../slots";
import { useControlledValue } from "./use-controlled-value";

export interface UseInteractionControllerOptions {
  readonly interactionMode?: WeekGridInteractionMode;
  readonly defaultInteractionMode?: WeekGridInteractionMode;
  readonly onInteractionModeChange?: (mode: WeekGridInteractionMode) => void;
  readonly onQuickCreate?: (payload: CalendarQuickCreatePayload) => void;
  readonly onPaintSelect?: (range: CalendarSelectionRange) => void;
  readonly onMoveRequest?: (request: CalendarMoveRequest) => void;
  readonly shouldInvalidate?: (state: InteractionState) => boolean;
}

export interface InteractionControllerInternals {
  readonly state: InteractionState;
  readonly activeMoveRequestId: number | null;
}

export interface UseInteractionControllerResult {
  readonly interactionMode: WeekGridInteractionMode;
  readonly state: InteractionState;
  readonly setInteractionMode: (mode: WeekGridInteractionMode) => void;
  readonly paint: CalendarSelectionRange | null;
  readonly pendingMove: PendingMove | null;
  readonly committedMove: PendingMove | null;
  readonly beginPaint: (cell: CalendarCell) => void;
  readonly updatePaint: (cell: CalendarCell) => void;
  readonly endPaint: () => void;
  readonly activateCell: (
    cell: CalendarCell,
    anchorRect?: DOMRectReadOnly
  ) => CalendarSelectionRange | null;
  readonly beginMove: (
    event: CalendarEvent,
    from: CalendarCell,
    to?: CalendarCell
  ) => void;
  readonly updateMove: (cell: CalendarCell) => void;
  readonly endMove: () => void;
  readonly confirmMove: () => void;
  readonly cancelMove: () => void;
  readonly reset: () => void;
  readonly getInternals: () => Readonly<InteractionControllerInternals>;
}

const DEFAULT_MODE: WeekGridInteractionMode = "quick-create";

type InteractionControllerAction =
  | InteractionAction
  | { readonly type: "replace"; readonly state: InteractionState };

const reduceInteraction = (
  state: InteractionState,
  action: InteractionControllerAction
): InteractionState =>
  action.type === "replace"
    ? action.state
    : transitionInteraction(state, action);

export { isEventActionable as isCalendarEventActionable } from "../../core/actionability";

export const useInteractionController = (
  options: UseInteractionControllerOptions = {}
): UseInteractionControllerResult => {
  const modeState = useControlledValue<WeekGridInteractionMode>({
    defaultValue: options.defaultInteractionMode ?? DEFAULT_MODE,
    onChange: options.onInteractionModeChange,
    value: options.interactionMode,
  });

  const mode = modeState.value;

  const [state, dispatch] = useReducer(
    reduceInteraction,
    mode,
    createInteractionState
  );

  // Imperative mirror: the move handshake reads and advances state across callbacks within one commit.
  const stateRef = useRef(state);
  const requestSequenceRef = useRef(0);
  const activeMoveRequestIdRef = useRef<number | null>(null);
  const quickCreateRef = useRef(options.onQuickCreate);
  const paintSelectRef = useRef(options.onPaintSelect);
  const moveRequestRef = useRef(options.onMoveRequest);

  const shouldResetState =
    state.mode !== mode || options.shouldInvalidate?.(state) === true;

  const renderState = shouldResetState ? createInteractionState(mode) : state;

  if (shouldResetState) {
    dispatch({ state: renderState, type: "replace" });
  }

  useEffect(() => {
    stateRef.current = renderState;

    if (shouldResetState) {
      activeMoveRequestIdRef.current = null;
    }
  }, [renderState, shouldResetState]);

  useEffect(() => {
    quickCreateRef.current = options.onQuickCreate;
  }, [options.onQuickCreate]);

  useEffect(() => {
    paintSelectRef.current = options.onPaintSelect;
  }, [options.onPaintSelect]);

  useEffect(() => {
    moveRequestRef.current = options.onMoveRequest;
  }, [options.onMoveRequest]);

  const apply = useCallback((action: InteractionAction): InteractionState => {
    const nextState = transitionInteraction(stateRef.current, action);
    stateRef.current = nextState;
    dispatch(action);

    return nextState;
  }, []);

  const clearActiveMove = useCallback((): void => {
    activeMoveRequestIdRef.current = null;
  }, []);

  const restoreModeState = useCallback((): void => {
    const nextState = createInteractionState(mode);
    stateRef.current = nextState;
    dispatch({ state: nextState, type: "replace" });
    clearActiveMove();
  }, [clearActiveMove, mode]);

  const prepareNextInteraction = useCallback((): void => {
    const currentState = stateRef.current;

    if (!currentState.committedMove) {
      return;
    }

    const nextState = { ...currentState, committedMove: null };
    stateRef.current = nextState;
    dispatch({ state: nextState, type: "replace" });
  }, []);

  const beginPaint = useCallback(
    (cell: CalendarCell): void => {
      // @cpt-begin:cpt-frontx-calendar-kit-algo-week-grid-paint-range:p1:inst-paint-anchor
      if (mode !== "paint-and-move" || stateRef.current.pendingMove) {
        return;
      }

      prepareNextInteraction();
      apply({ cell, type: "paint-start" });
      // @cpt-end:cpt-frontx-calendar-kit-algo-week-grid-paint-range:p1:inst-paint-anchor
    },
    [apply, mode, prepareNextInteraction]
  );

  const updatePaint = useCallback(
    (cell: CalendarCell): void => {
      // @cpt-begin:cpt-frontx-calendar-kit-algo-week-grid-paint-range:p1:inst-paint-extend
      if (mode !== "paint-and-move") {
        return;
      }

      apply({ cell, type: "paint-update" });
      // @cpt-end:cpt-frontx-calendar-kit-algo-week-grid-paint-range:p1:inst-paint-extend
    },
    [apply, mode]
  );

  const endPaint = useCallback((): void => {
    // @cpt-begin:cpt-frontx-calendar-kit-algo-week-grid-paint-range:p1:inst-paint-return
    if (mode !== "paint-and-move") {
      return;
    }

    const range = stateRef.current.paint;
    const wasPainting = stateRef.current.paintAnchor !== null;
    apply({ type: "paint-end" });

    if (wasPainting && range) {
      paintSelectRef.current?.(range);
    }
    // @cpt-end:cpt-frontx-calendar-kit-algo-week-grid-paint-range:p1:inst-paint-return
  }, [apply, mode]);

  const activateCell = useCallback(
    (
      cell: CalendarCell,
      anchorRect?: DOMRectReadOnly
    ): CalendarSelectionRange | null => {
      // @cpt-begin:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-quick-create
      if (mode !== "quick-create") {
        return null;
      }

      const range = buildSelectionRange(cell, cell);

      if (!range) {
        return null;
      }

      if (anchorRect) {
        quickCreateRef.current?.({ anchorRect, range });
      } else {
        quickCreateRef.current?.({ range });
      }

      // @cpt-end:cpt-frontx-calendar-kit-flow-week-grid-host-embedding:p1:inst-wg-quick-create
      return range;
    },
    [mode]
  );

  const emitMoveRequest = useCallback((): void => {
    // @cpt-begin:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1:inst-move-request
    const { pendingMove } = stateRef.current;
    const onMoveRequest = moveRequestRef.current;

    if (!pendingMove || activeMoveRequestIdRef.current !== null) {
      return;
    }

    if (!onMoveRequest) {
      apply({ type: "move-cancel" });
      clearActiveMove();
      return;
    }

    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    activeMoveRequestIdRef.current = requestId;

    const isActive = (): boolean => {
      const currentMove = stateRef.current.pendingMove;

      return (
        activeMoveRequestIdRef.current === requestId &&
        currentMove !== null &&
        currentMove.event.id === pendingMove.event.id &&
        currentMove.from.start === pendingMove.from.start &&
        currentMove.to.start === pendingMove.to.start
      );
    };

    const confirm = (): void => {
      if (!isActive()) {
        return;
      }

      apply({ type: "move-confirm" });
      clearActiveMove();
    };

    const cancel = (): void => {
      if (!isActive()) {
        return;
      }

      apply({ type: "move-cancel" });
      clearActiveMove();
    };

    // @cpt-end:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1:inst-move-request
    onMoveRequest({
      cancel,
      confirm,
      event: pendingMove.event,
      from: pendingMove.from,
      to: pendingMove.to,
    });
  }, [apply, clearActiveMove]);

  const beginMove = useCallback(
    (event: CalendarEvent, from: CalendarCell, to?: CalendarCell): void => {
      // @cpt-begin:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1:inst-move-request
      if (
        mode !== "paint-and-move" ||
        stateRef.current.pendingMove ||
        !isEventActionable(event)
      ) {
        return;
      }

      prepareNextInteraction();
      apply({ event, from, type: "move-start" });

      if (to) {
        apply({ to, type: "move-target" });
        emitMoveRequest();
      }
      // @cpt-end:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1:inst-move-request
    },
    [apply, emitMoveRequest, mode, prepareNextInteraction]
  );

  const updateMove = useCallback(
    (cell: CalendarCell): void => {
      if (
        mode !== "paint-and-move" ||
        activeMoveRequestIdRef.current !== null
      ) {
        return;
      }

      apply({ to: cell, type: "move-target" });
    },
    [apply, mode]
  );

  const endMove = useCallback((): void => {
    // @cpt-begin:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1:inst-move-return
    if (mode !== "paint-and-move") {
      return;
    }

    emitMoveRequest();
    // @cpt-end:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1:inst-move-return
  }, [emitMoveRequest, mode]);

  const confirmMove = useCallback((): void => {
    // @cpt-begin:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1:inst-move-resolve
    const { pendingMove } = stateRef.current;

    if (!pendingMove) {
      return;
    }

    if (activeMoveRequestIdRef.current === null) {
      if (moveRequestRef.current) {
        return;
      }

      apply({ type: "move-confirm" });
      return;
    }

    apply({ type: "move-confirm" });
    clearActiveMove();
    // @cpt-end:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1:inst-move-resolve
  }, [apply, clearActiveMove]);

  const cancelMove = useCallback((): void => {
    // @cpt-begin:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1:inst-move-resolve
    if (!stateRef.current.pendingMove) {
      return;
    }

    apply({ type: "move-cancel" });
    clearActiveMove();
    // @cpt-end:cpt-frontx-calendar-kit-algo-week-grid-move-handshake:p1:inst-move-resolve
  }, [apply, clearActiveMove]);

  const getInternals = useCallback(
    (): Readonly<InteractionControllerInternals> => ({
      activeMoveRequestId: activeMoveRequestIdRef.current,
      state: stateRef.current,
    }),
    []
  );

  return useMemo(
    () => ({
      activateCell,
      beginMove,
      beginPaint,
      cancelMove,
      committedMove: renderState.committedMove,
      confirmMove,
      endMove,
      endPaint,
      getInternals,
      interactionMode: mode,
      paint: renderState.paint,
      pendingMove: renderState.pendingMove,
      reset: restoreModeState,
      setInteractionMode: modeState.setValue,
      state: renderState,
      updateMove,
      updatePaint,
    }),
    [
      activateCell,
      beginMove,
      beginPaint,
      cancelMove,
      confirmMove,
      endMove,
      endPaint,
      getInternals,
      mode,
      modeState.setValue,
      restoreModeState,
      renderState,
      updateMove,
      updatePaint,
    ]
  );
};
