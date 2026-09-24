import { clsx } from "clsx";
import { X } from "lucide-react";
import { useCallback, useContext, useEffect, useMemo, useRef } from "react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  MouseEvent,
  ReactNode,
  Ref,
} from "react";
import { createPortal } from "react-dom";

import { useCalendarLocalization } from "../../../i18n/calendar-localization";
import {
  collectFocusable,
  cycleTabFocus,
  resolveActiveElement,
} from "../focus-trap";
import type { TabKeyEvent } from "../focus-trap";
import { noopCleanup, subscribeGlobalEvent } from "../global-event-listener";
import { assignRef } from "../listbox-internals-utils";
import { swallowNextClick } from "../popover/popover-internals";
import { hasNestedLayer, isNestedLayerEvent } from "../portal-layer";
import {
  ModalContentContext,
  ModalContext,
  useModalContentIds,
  useModalContext,
} from "./dialog-context";

import styles from "./dialog.module.css";

interface ModalRootProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly children: ReactNode;
}

export const ModalRoot = ({ open, onOpenChange, children }: ModalRootProps) => {
  const requestClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const contextValue = useMemo(
    () => ({ open, requestClose }),
    [open, requestClose]
  );

  return (
    <ModalContext.Provider value={contextValue}>
      {children}
    </ModalContext.Provider>
  );
};

const openModals = new Set<HTMLElement>();

const isTopmostModal = (panel: HTMLElement): boolean => {
  let topmost: HTMLElement | null = null;

  for (const openPanel of openModals) {
    topmost = openPanel;
  }

  return topmost === panel && !hasNestedLayer(panel);
};

const eventPath = (event: Event): readonly EventTarget[] => {
  const composedPath = event.composedPath();

  if (composedPath.length > 0) {
    return composedPath;
  }
  if (event.target) {
    return [event.target];
  }
  return [];
};

const isOwnPress = (event: Event, panel: HTMLElement): boolean => {
  const path = eventPath(event);

  return path.includes(panel) || isNestedLayerEvent(panel, path);
};

const focusPanel = (panel: HTMLElement, focusFirst: boolean): void => {
  const target = focusFirst ? (collectFocusable(panel)[0] ?? panel) : panel;
  target.focus({ preventScroll: true });
};

const trapTabFocus = (event: TabKeyEvent, panel: HTMLElement | null): void => {
  if (panel === null || !isTopmostModal(panel)) {
    return;
  }

  cycleTabFocus(event, panel, { preventScroll: true });
};

export interface ModalSurfaceProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "role"
> {
  readonly role: "dialog" | "alertdialog";
  readonly container?: Element | DocumentFragment;
  readonly backdropClassName: string;
  readonly surfaceClassName: string;
  readonly focusFirst?: boolean;
  readonly ariaLabel?: string;
  readonly ariaLabelledBy?: string;
  readonly ariaDescribedBy?: string;
  readonly ref?: Ref<HTMLDivElement>;
  readonly children?: ReactNode;
}

export const ModalSurface = ({
  role,
  container,
  backdropClassName,
  surfaceClassName,
  focusFirst = false,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  ref,
  children,
  ...surfaceProps
}: ModalSurfaceProps) => {
  const { open, requestClose } = useModalContext();

  const panelRef = useRef<HTMLDivElement | null>(null);
  const originRef = useRef<HTMLElement | null>(null);

  const setPanelRef = useCallback(
    (node: HTMLDivElement | null): void => {
      panelRef.current = node;
      assignRef(ref, node);
    },
    [ref]
  );

  useEffect(() => {
    const panel = panelRef.current;

    if (!open || !panel) {
      return noopCleanup;
    }

    originRef.current = resolveActiveElement(panel);
    openModals.add(panel);
    focusPanel(panel, focusFirst);

    const root = panel.getRootNode();
    const { ownerDocument } = panel;

    const scopedTarget =
      root instanceof Document || root instanceof DocumentFragment
        ? root
        : null;

    const hasScopedTarget =
      scopedTarget !== null && scopedTarget !== ownerDocument;

    const handleKeyDown = (event: Event): void => {
      if (!(event instanceof KeyboardEvent)) {
        return;
      }
      if (!isTopmostModal(panel)) {
        return;
      }

      if (event.key === "Escape") {
        if (panel.querySelector('[role="listbox"]') !== null) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        requestClose();

        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      // Capture handles in-panel Tab; this rescues focus that escaped first.
      if (eventPath(event).includes(panel)) {
        return;
      }

      trapTabFocus(event, panel);
    };

    const handlePointerDown = (event: Event): void => {
      if (!isTopmostModal(panel) || isOwnPress(event, panel)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      swallowNextClick();
      requestClose();
    };

    const handleFocusIn = (event: Event): void => {
      if (!isTopmostModal(panel) || isOwnPress(event, panel)) {
        return;
      }

      event.stopPropagation();
      panel.focus({ preventScroll: true });
    };

    const unsubscribe = [
      subscribeGlobalEvent(ownerDocument, "keydown", handleKeyDown, true),
      subscribeGlobalEvent(
        ownerDocument,
        "pointerdown",
        handlePointerDown,
        true
      ),
      subscribeGlobalEvent(ownerDocument, "focusin", handleFocusIn, true),
      ...(hasScopedTarget
        ? [
            subscribeGlobalEvent(scopedTarget, "keydown", handleKeyDown, true),
            subscribeGlobalEvent(
              scopedTarget,
              "pointerdown",
              handlePointerDown,
              true
            ),
            subscribeGlobalEvent(scopedTarget, "focusin", handleFocusIn, true),
          ]
        : []),
    ];

    return () => {
      for (const unsubscribeListener of unsubscribe) {
        unsubscribeListener();
      }

      openModals.delete(panel);
      const origin = originRef.current;
      originRef.current = null;

      if (origin !== null && origin.isConnected) {
        origin.focus({ preventScroll: true });
      }
    };
  }, [focusFirst, open, requestClose]);

  if (!open) {
    return null;
  }

  const surface = (
    <>
      <div aria-hidden="true" className={backdropClassName} />
      <div
        {...surfaceProps}
        ref={setPanelRef}
        aria-describedby={ariaDescribedBy}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-modal="true"
        className={surfaceClassName}
        onKeyDownCapture={(event) => {
          if (event.key === "Tab") {
            trapTabFocus(event, panelRef.current);
          }
        }}
        role={role}
        tabIndex={-1}
      >
        {children}
      </div>
    </>
  );

  return container ? createPortal(surface, container) : surface;
};

interface DialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly children: ReactNode;
}

export const Dialog = ({ open, onOpenChange, children }: DialogProps) => (
  <ModalRoot open={open} onOpenChange={onOpenChange}>
    {children}
  </ModalRoot>
);

interface DialogContentProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "role"
> {
  readonly container?: Element | DocumentFragment;
  readonly showBackdrop?: boolean;
  readonly showCloseButton?: boolean;
  readonly closeLabel?: string;
  readonly label?: string;
  readonly labelledBy?: string;
  readonly describedBy?: string;
  readonly ariaLabelledBy?: string;
  readonly ariaDescribedBy?: string;
  readonly titleId?: string;
  readonly descriptionId?: string;
  readonly ref?: Ref<HTMLDivElement>;
  readonly children?: ReactNode;
}

export const DialogContent = ({
  container,
  showBackdrop = true,
  showCloseButton = true,
  closeLabel,
  label,
  labelledBy,
  describedBy,
  ariaLabelledBy,
  ariaDescribedBy,
  titleId,
  descriptionId,
  className,
  children,
  ref,
  ...props
}: DialogContentProps) => {
  const { requestClose } = useModalContext();
  const { t } = useCalendarLocalization();
  const resolvedCloseLabel = closeLabel ?? t("calendar.dialog.close");

  const contentIds = useModalContentIds(titleId, descriptionId);

  const resolvedLabelledBy =
    labelledBy ??
    ariaLabelledBy ??
    props["aria-labelledby"] ??
    contentIds.titleId;

  const resolvedDescribedBy =
    describedBy ??
    ariaDescribedBy ??
    props["aria-describedby"] ??
    contentIds.descriptionId;

  return (
    <ModalSurface
      {...props}
      ariaDescribedBy={resolvedDescribedBy}
      ariaLabel={label ?? props["aria-label"]}
      ariaLabelledBy={resolvedLabelledBy}
      backdropClassName={showBackdrop ? styles.backdrop : styles.noBackdrop}
      container={container}
      ref={ref}
      role="dialog"
      surfaceClassName={clsx(styles.surface, className)}
    >
      <ModalContentContext.Provider value={contentIds}>
        {children}
        {showCloseButton ? (
          <button
            type="button"
            aria-label={resolvedCloseLabel}
            className={styles.closeButton}
            onClick={requestClose}
          >
            <X aria-hidden="true" className={styles.icon} />
          </button>
        ) : null}
      </ModalContentContext.Provider>
    </ModalSurface>
  );
};

type DialogCloseProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const DialogClose = ({ onClick, ...props }: DialogCloseProps) => {
  const { requestClose } = useModalContext();

  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    onClick?.(event);

    if (!event.defaultPrevented) {
      requestClose();
    }
  };

  return <button {...props} type="button" onClick={handleClick} />;
};

type DialogHeaderProps = HTMLAttributes<HTMLDivElement>;

export const DialogHeader = ({ className, ...props }: DialogHeaderProps) => (
  <div {...props} className={clsx(styles.header, className)} />
);

type DialogFooterProps = HTMLAttributes<HTMLDivElement>;

export const DialogFooter = ({ className, ...props }: DialogFooterProps) => (
  <div {...props} className={clsx(styles.footer, className)} />
);

type DialogTitleProps = HTMLAttributes<HTMLHeadingElement>;

export const DialogTitle = ({
  className,
  id,
  children,
  ...props
}: DialogTitleProps) => {
  const contentIds = useContext(ModalContentContext);

  return (
    <h2
      {...props}
      className={clsx(styles.title, className)}
      id={id ?? contentIds?.titleId}
    >
      {children}
    </h2>
  );
};

type DialogDescriptionProps = HTMLAttributes<HTMLParagraphElement>;

export const DialogDescription = ({
  className,
  id,
  ...props
}: DialogDescriptionProps) => {
  const contentIds = useContext(ModalContentContext);

  return (
    <p
      {...props}
      className={clsx(styles.description, className)}
      id={id ?? contentIds?.descriptionId}
    >
      {props.children}
    </p>
  );
};

Dialog.displayName = "Dialog";
DialogContent.displayName = "DialogContent";
DialogClose.displayName = "DialogClose";
DialogHeader.displayName = "DialogHeader";
DialogFooter.displayName = "DialogFooter";
DialogTitle.displayName = "DialogTitle";
DialogDescription.displayName = "DialogDescription";
