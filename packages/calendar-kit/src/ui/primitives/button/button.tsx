import { Button as UiButton } from "@gears-frontx/ui-kit";
import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

import { assignRef } from "../listbox-internals-utils";
import { flattenNodeList, isPresentNode } from "../react-node-text";

import styles from "./button.module.css";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "ghost"
  | "danger"
  | "default"
  | "destructive"
  | "outline"
  | "link";

type ButtonSize =
  | "xxl"
  | "xl"
  | "l"
  | "m"
  | "s"
  | "xs"
  | "content"
  | "default"
  | "sm"
  | "lg";

type UiButtonVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link";
type UiButtonSize = "default" | "sm" | "lg";

const VARIANT_CLASS: Readonly<Record<ButtonVariant, string>> = {
  danger: styles.danger,
  default: styles.primary,
  destructive: styles.danger,
  ghost: styles.ghost,
  link: styles.ghost,
  outline: styles.tertiary,
  primary: styles.primary,
  secondary: styles.secondary,
  tertiary: styles.tertiary,
};

const UI_VARIANT: Readonly<Record<ButtonVariant, UiButtonVariant>> = {
  danger: "destructive",
  default: "default",
  destructive: "destructive",
  ghost: "ghost",
  link: "link",
  outline: "outline",
  primary: "default",
  secondary: "secondary",
  tertiary: "outline",
};

const SIZE_CLASS: Readonly<Record<ButtonSize, string>> = {
  content: styles.sizeContent,
  default: styles.sizeL,
  l: styles.sizeL,
  lg: styles.sizeXl,
  m: styles.sizeM,
  s: styles.sizeS,
  sm: styles.sizeM,
  xl: styles.sizeXl,
  xs: styles.sizeXs,
  xxl: styles.sizeXxl,
};

const UI_SIZE: Readonly<Record<ButtonSize, UiButtonSize>> = {
  content: "default",
  default: "default",
  l: "default",
  lg: "lg",
  m: "sm",
  s: "sm",
  sm: "sm",
  xl: "lg",
  xs: "sm",
  xxl: "lg",
};

interface ButtonPropsBase extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label"
> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly selected?: boolean;
  readonly loading?: boolean;
  readonly round?: boolean;
  readonly leftIcon?: ReactNode;
  readonly rightIcon?: ReactNode;
  readonly badge?: ReactNode;
  readonly ref?: Ref<HTMLButtonElement>;
  readonly focusableWhenDisabled?: boolean;
}

type ButtonProps = ButtonPropsBase &
  (
    | { readonly onlyIcon?: false; readonly "aria-label"?: string }
    | { readonly onlyIcon: true; readonly "aria-label": string }
  );

const hasRenderableChildren = (children: ReactNode): boolean =>
  flattenNodeList(children).some((child) => child !== "");

interface ButtonContentProps {
  readonly badge: ReactNode;
  readonly children: ReactNode;
  readonly hasChildren: boolean;
  readonly loading: boolean;
  readonly onlyIcon: boolean;
  readonly rightIcon: ReactNode;
}

const ButtonContent = ({
  loading,
  hasChildren,
  children,
  onlyIcon,
  rightIcon,
  badge,
}: ButtonContentProps) => (
  <span className={clsx(styles.content, loading && styles.contentLoading)}>
    {loading ? <Loader2 aria-hidden="true" className={styles.spinner} /> : null}
    {hasChildren ? (
      <span
        className={clsx(loading && styles.srOnly)}
        aria-hidden={onlyIcon ? "true" : undefined}
      >
        {children}
      </span>
    ) : null}
    {isPresentNode(rightIcon) ? (
      <span aria-hidden="true" className={styles.rightIcon}>
        {rightIcon}
      </span>
    ) : null}
    {isPresentNode(badge) ? (
      <span className={styles.badge}>{badge}</span>
    ) : null}
  </span>
);

const Button = ({
  ref,
  className,
  variant = "primary",
  size = "m",
  selected,
  loading = false,
  round = false,
  onlyIcon = false,
  leftIcon,
  rightIcon,
  badge,
  focusableWhenDisabled = false,
  disabled = false,
  children,
  "aria-label": ariaLabel,
  "aria-pressed": ariaPressed,
  ...props
}: ButtonProps) => {
  const buttonElementRef = useRef<HTMLButtonElement | null>(null);

  const isDisabled = disabled || loading;
  const hasChildren = hasRenderableChildren(children);
  const hasTrailingContent = isPresentNode(rightIcon) || isPresentNode(badge);
  const hasButtonContent = loading || hasChildren || hasTrailingContent;
  const pressed = selected ?? ariaPressed;

  const setButtonRef = useCallback(
    (element: HTMLButtonElement | null) => {
      buttonElementRef.current = element;
      assignRef(ref, element);
    },
    [ref]
  );

  useEffect(() => {
    /* ui-kit's loading prop swaps disabled for focusable ARIA-disabled; the calendar keeps native disabled. */
    const element = buttonElementRef.current;

    if (!element) {
      return;
    }

    if (loading) {
      element.setAttribute("aria-busy", "true");
    } else {
      element.removeAttribute("aria-busy");
    }
  }, [loading]);

  return (
    <UiButton
      {...props}
      ref={setButtonRef}
      variant={UI_VARIANT[variant]}
      size={UI_SIZE[size]}
      icon={leftIcon}
      focusableWhenDisabled={focusableWhenDisabled}
      disabled={isDisabled}
      className={clsx(
        styles.button,
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        round && styles.round,
        onlyIcon && styles.onlyIcon,
        className
      )}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      aria-disabled={isDisabled && focusableWhenDisabled ? "true" : undefined}
    >
      {hasButtonContent ? (
        <ButtonContent
          loading={loading}
          hasChildren={hasChildren}
          onlyIcon={onlyIcon}
          rightIcon={rightIcon}
          badge={badge}
        >
          {children}
        </ButtonContent>
      ) : null}
    </UiButton>
  );
};

Button.displayName = "Button";

export { Button };
