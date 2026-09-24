import { clsx } from "clsx";
import { useContext } from "react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  MouseEvent,
  ReactNode,
} from "react";

import { ModalRoot, ModalSurface } from "../dialog/dialog";
import type { ModalSurfaceProps } from "../dialog/dialog";
import {
  ModalContentContext,
  useModalContentIds,
  useModalContext,
} from "../dialog/dialog-context";

import styles from "./alert-dialog.module.css";

interface AlertDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly children: ReactNode;
}

export const AlertDialog = ({
  open,
  onOpenChange,
  children,
}: AlertDialogProps) => (
  <ModalRoot open={open} onOpenChange={onOpenChange}>
    {children}
  </ModalRoot>
);

interface AlertDialogContentProps extends Omit<
  ModalSurfaceProps,
  "role" | "backdropClassName" | "surfaceClassName" | "focusFirst" | "children"
> {
  readonly showBackdrop?: boolean;
  readonly label?: string;
  readonly labelledBy?: string;
  readonly describedBy?: string;
  readonly ariaLabelledBy?: string;
  readonly ariaDescribedBy?: string;
  readonly titleId?: string;
  readonly descriptionId?: string;
  readonly children?: ReactNode;
}

export const AlertDialogContent = ({
  showBackdrop = true,
  label,
  labelledBy,
  describedBy,
  ariaLabelledBy,
  ariaDescribedBy,
  titleId,
  descriptionId,
  className,
  children,
  ...props
}: AlertDialogContentProps) => {
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
  const hasLabel = (label ?? null) !== null;

  return (
    <ModalSurface
      {...props}
      ariaDescribedBy={resolvedDescribedBy}
      ariaLabel={label ?? props["aria-label"]}
      ariaLabelledBy={hasLabel ? undefined : resolvedLabelledBy}
      backdropClassName={showBackdrop ? styles.backdrop : styles.noBackdrop}
      focusFirst
      role="alertdialog"
      surfaceClassName={clsx(styles.surface, className)}
    >
      <ModalContentContext.Provider value={contentIds}>
        {children}
      </ModalContentContext.Provider>
    </ModalSurface>
  );
};

type AlertDialogHeaderProps = HTMLAttributes<HTMLDivElement>;

export const AlertDialogHeader = ({
  className,
  ...props
}: AlertDialogHeaderProps) => (
  <div {...props} className={clsx(styles.header, className)} />
);

type AlertDialogFooterProps = HTMLAttributes<HTMLDivElement>;

export const AlertDialogFooter = ({
  className,
  ...props
}: AlertDialogFooterProps) => (
  <div {...props} className={clsx(styles.footer, className)} />
);

type AlertDialogTitleProps = HTMLAttributes<HTMLHeadingElement>;

export const AlertDialogTitle = ({
  className,
  id,
  children,
  ...props
}: AlertDialogTitleProps) => {
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

type AlertDialogDescriptionProps = HTMLAttributes<HTMLParagraphElement>;

export const AlertDialogDescription = ({
  className,
  id,
  children,
  ...props
}: AlertDialogDescriptionProps) => {
  const contentIds = useContext(ModalContentContext);

  return (
    <p
      {...props}
      className={clsx(styles.description, className)}
      id={id ?? contentIds?.descriptionId}
    >
      {children}
    </p>
  );
};

type AlertDialogButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

const AlertDialogButton = ({
  buttonClassName,
  className,
  onClick,
  children,
  ...props
}: AlertDialogButtonProps & {
  readonly buttonClassName: string;
}) => {
  const { requestClose } = useModalContext();

  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    onClick?.(event);

    if (!event.defaultPrevented) {
      requestClose();
    }
  };

  return (
    <button
      {...props}
      className={clsx(buttonClassName, className)}
      onClick={handleClick}
      type="button"
    >
      {children}
    </button>
  );
};

export const AlertDialogCancel = (props: AlertDialogButtonProps) => (
  <AlertDialogButton {...props} buttonClassName={styles.cancel} />
);

export const AlertDialogAction = (props: AlertDialogButtonProps) => (
  <AlertDialogButton {...props} buttonClassName={styles.action} />
);

AlertDialog.displayName = "AlertDialog";
AlertDialogContent.displayName = "AlertDialogContent";
AlertDialogHeader.displayName = "AlertDialogHeader";
AlertDialogFooter.displayName = "AlertDialogFooter";
AlertDialogTitle.displayName = "AlertDialogTitle";
AlertDialogDescription.displayName = "AlertDialogDescription";
AlertDialogCancel.displayName = "AlertDialogCancel";
AlertDialogAction.displayName = "AlertDialogAction";
