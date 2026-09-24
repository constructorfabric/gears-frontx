"use client";

import {
  Combobox as UiCombobox,
  ComboboxChip as UiComboboxChip,
  ComboboxChips as UiComboboxChips,
  ComboboxChipsInput as UiComboboxChipsInput,
  ComboboxContent as UiComboboxContent,
  ComboboxEmpty as UiComboboxEmpty,
  ComboboxInput as UiComboboxInput,
  ComboboxItem as UiComboboxItem,
  ComboboxList as UiComboboxList,
  ComboboxTrigger as UiComboboxTrigger,
} from "@gears-frontx/ui-kit";
import { clsx } from "clsx";
import { CircleX } from "lucide-react";
import { useCallback } from "react";
import type {
  ChangeEventHandler,
  ComponentProps,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  RefObject,
} from "react";

import { useCalendarLocalization } from "../../../i18n/calendar-localization";
import { isPresentNode, textFromNode } from "../react-node-text";
import { useComboboxField } from "./use-combobox-field";
import type {
  ComboboxControlState,
  ComboboxField,
  ComboboxSize,
} from "./use-combobox-field";

import styles from "./combobox.module.css";

const CONTROL_SIZE_CLASSES = {
  l: styles.controlSizeL,
  m: styles.controlSizeM,
  xl: styles.controlSizeXl,
  xxl: styles.controlSizeXxl,
} as const;

const controlStateClass = (controlState: ComboboxControlState): string =>
  styles[`control${controlState[0].toUpperCase()}${controlState.slice(1)}`];

const rootClassName = (
  embedded: boolean,
  className: string | undefined
): string =>
  clsx(
    styles.root,
    embedded ? styles.rootEmbedded : styles.rootStandalone,
    className
  );

const fieldControlClassName = (
  size: ComboboxSize,
  controlState: ComboboxControlState,
  embedded: boolean,
  controlClassName: string | undefined
): string =>
  clsx(
    styles.control,
    embedded ? styles.controlEmbedded : styles.controlStandalone,
    CONTROL_SIZE_CLASSES[size],
    controlStateClass(controlState),
    controlClassName
  );

const resolveDescribedBy = (
  hasMessage: boolean,
  messageId: string,
  ariaDescribedBy: string | undefined
): string =>
  [hasMessage ? messageId : undefined, ariaDescribedBy]
    .filter(Boolean)
    .join(" ");

const resolveLabelledBy = (
  ariaLabelledBy: string | undefined,
  hasLabel: boolean,
  ariaLabel: string | undefined,
  labelId: string
): string | undefined =>
  ariaLabelledBy ?? (hasLabel && ariaLabel === undefined ? labelId : undefined);

export interface ComboboxOption {
  readonly value: string;
  readonly label: ReactNode;
  readonly disabled?: boolean;
}

interface ComboboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  | "children"
  | "disabled"
  | "onChange"
  | "onSelect"
  | "readOnly"
  | "size"
  | "value"
> {
  readonly id?: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly onChange?: ChangeEventHandler<HTMLInputElement>;
  readonly options: readonly ComboboxOption[];
  readonly onSelect?: (option: ComboboxOption) => void;
  readonly closeOnSelect?: boolean;
  readonly selectedValues?: readonly string[];
  readonly renderOption?: (option: ComboboxOption) => ReactNode;
  readonly loading?: boolean;
  readonly emptyMessage?: ReactNode;
  readonly loadingMessage?: ReactNode;
  readonly placeholder?: string;
  readonly size?: ComboboxSize;
  readonly invalid?: boolean;
  readonly label?: ReactNode;
  readonly message?: ReactNode;
  readonly readOnly?: boolean;
  readonly tags?: boolean;
  readonly onSearchChange?: (query: string) => void;
  readonly onTagRemove?: (value: string) => void;
  readonly disabled?: boolean;
  readonly iconLeft?: ReactNode;
  readonly embedded?: boolean;
  readonly controlClassName?: string;
  readonly showChevron?: boolean;
  readonly onClearTags?: () => void;
  readonly clearTagsLabel?: string;
  readonly showSelectedCheck?: boolean;
  readonly anchorRef?: RefObject<HTMLElement | null>;
  readonly ref?: Ref<HTMLInputElement>;
}

type ComboboxInputProps = ComponentProps<typeof UiComboboxInput>;

interface ComboboxContentProps {
  readonly anchor: RefObject<HTMLElement | null>;
  readonly field: ComboboxField;
}

const ComboboxContent = ({ anchor, field }: ComboboxContentProps) => {
  const {
    emptyMessage,
    handleOptionClick,
    handleOptionMouseEnter,
    handleOptionPointerDown,
    highlightedValue,
    loading,
    loadingMessage,
    open,
    optionsByValue,
    portalContainer,
    renderOption,
    showSelectedCheck,
  } = field;

  const renderItem = useCallback(
    (itemValue: string) => {
      const option = optionsByValue.get(itemValue) ?? {
        label: itemValue,
        value: itemValue,
      };

      return (
        <UiComboboxItem
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          data-calendar-active={
            highlightedValue === option.value ? "" : undefined
          }
          onMouseEnter={() => {
            handleOptionMouseEnter(option.value);
          }}
          onPointerDown={() => {
            handleOptionPointerDown(option);
          }}
          onClick={(event) => {
            handleOptionClick(event, option.value);
          }}
          className={clsx(
            styles.item,
            showSelectedCheck ? undefined : styles.itemNoCheck
          )}
        >
          {renderOption ? renderOption(option) : option.label}
        </UiComboboxItem>
      );
    },
    [
      handleOptionClick,
      handleOptionMouseEnter,
      handleOptionPointerDown,
      highlightedValue,
      optionsByValue,
      renderOption,
      showSelectedCheck,
    ]
  );

  if (portalContainer === null || !open) {
    return null;
  }

  return (
    <UiComboboxContent container={portalContainer} anchor={anchor}>
      {loading && isPresentNode(loadingMessage) ? (
        <p role="status" className={styles.panelMessage}>
          {loadingMessage}
        </p>
      ) : null}
      {!loading && isPresentNode(emptyMessage) ? (
        <UiComboboxEmpty className={styles.panelMessage}>
          {emptyMessage}
        </UiComboboxEmpty>
      ) : null}
      <UiComboboxList className={styles.panelList}>{renderItem}</UiComboboxList>
    </UiComboboxContent>
  );
};

interface ComboboxRootProps {
  readonly autoComplete: ComboboxProps["autoComplete"];
  readonly disabled: boolean;
  readonly form: ComboboxProps["form"];
  readonly inputValue: string;
  readonly name: ComboboxProps["name"];
  readonly readOnly: boolean;
  readonly required: ComboboxProps["required"];
}

interface ComboboxBodyProps extends ComboboxRootProps {
  readonly field: ComboboxField;
  readonly inputProps: ComboboxInputProps;
}

interface ComboboxTagsBodyProps extends ComboboxBodyProps {
  readonly clearTagsLabel?: string;
  readonly embedded: boolean;
  readonly onClearTags: (() => void) | undefined;
}

const ComboboxTagsBody = ({
  autoComplete,
  clearTagsLabel,
  disabled,
  embedded,
  field,
  form,
  inputProps,
  inputValue,
  name,
  onClearTags,
  readOnly,
  required,
}: ComboboxTagsBodyProps) => {
  const {
    chipsAnchor,
    controlId,
    filteredValues,
    handleInputValueChange,
    handleMultipleValueChange,
    handleOpenChange,
    hasSelectedTags,
    itemToStringLabel,
    open,
    optionValues,
    panelAnchor,
    selectedTagOptions,
    selectedValues,
    showChevron,
  } = field;

  const { t } = useCalendarLocalization();

  return (
    <UiCombobox<string, true>
      multiple
      id={controlId}
      items={optionValues}
      filteredItems={filteredValues}
      value={selectedValues}
      inputValue={inputValue}
      name={name}
      form={form}
      required={required}
      autoComplete={autoComplete}
      disabled={disabled}
      readOnly={readOnly}
      open={open}
      autoHighlight
      openOnInputClick={false}
      onOpenChange={handleOpenChange}
      onInputValueChange={handleInputValueChange}
      onValueChange={handleMultipleValueChange}
      itemToStringLabel={itemToStringLabel}
    >
      <UiComboboxChips
        ref={chipsAnchor}
        className={clsx(styles.chips, embedded && styles.chipsEmbedded)}
      >
        {selectedTagOptions.map((option) => (
          <UiComboboxChip
            key={option.value}
            data-calendar-combobox-chip=""
            data-calendar-combobox-value={option.value}
            className={styles.tag}
            removeLabel={`${t("calendar.tag.remove")} ${textFromNode(option.label) || option.value}`}
          >
            {option.label}
          </UiComboboxChip>
        ))}
        <UiComboboxChipsInput {...inputProps} className={styles.chipsInput} />
      </UiComboboxChips>
      {hasSelectedTags || showChevron ? (
        <span className={styles.tagActions}>
          {hasSelectedTags && onClearTags !== undefined ? (
            <button
              type="button"
              aria-label={
                clearTagsLabel ?? t("calendar.combobox.clearSelectedPeople")
              }
              disabled={disabled || readOnly}
              onPointerDown={(event) => {
                event.preventDefault();
              }}
              onClick={onClearTags}
              className={styles.tagRemove}
            >
              <CircleX aria-hidden="true" />
            </button>
          ) : null}
          {showChevron ? (
            <UiComboboxTrigger
              aria-label={t("calendar.combobox.toggleOptions")}
              className={styles.tagTrigger}
            />
          ) : null}
        </span>
      ) : null}
      <ComboboxContent anchor={panelAnchor} field={field} />
    </UiCombobox>
  );
};

interface ComboboxMessageProps {
  readonly invalid: boolean;
  readonly message: ReactNode;
  readonly messageId: string;
}

const ComboboxMessage = ({
  invalid,
  message,
  messageId,
}: ComboboxMessageProps) =>
  isPresentNode(message) ? (
    <p
      id={messageId}
      role={invalid ? "alert" : undefined}
      className={clsx(styles.message, invalid && styles.messageInvalid)}
    >
      {message}
    </p>
  ) : null;

interface ComboboxSingleBodyProps extends ComboboxBodyProps {
  readonly inputRestProps: InputHTMLAttributes<HTMLInputElement>;
}

const ComboboxSingleBody = ({
  autoComplete,
  disabled,
  field,
  form,
  inputProps,
  inputRestProps,
  inputValue,
  name,
  readOnly,
  required,
}: ComboboxSingleBodyProps) => {
  const {
    controlId,
    filteredValues,
    handleInputValueChange,
    handleOpenChange,
    handleSingleValueChange,
    itemToStringLabel,
    open,
    optionValues,
    panelAnchor,
    selectedValues,
    showChevron,
  } = field;

  return (
    <UiCombobox<string>
      id={controlId}
      items={optionValues}
      filteredItems={filteredValues}
      value={selectedValues[0] ?? null}
      inputValue={inputValue}
      name={name}
      form={form}
      required={required}
      autoComplete={autoComplete}
      disabled={disabled}
      readOnly={readOnly}
      open={open}
      autoHighlight
      openOnInputClick={false}
      onOpenChange={handleOpenChange}
      onInputValueChange={handleInputValueChange}
      onValueChange={handleSingleValueChange}
      itemToStringLabel={itemToStringLabel}
    >
      <span className={styles.inputWrap}>
        <UiComboboxInput
          {...inputProps}
          {...inputRestProps}
          className={styles.input}
          showTrigger={showChevron}
        />
      </span>
      <ComboboxContent anchor={panelAnchor} field={field} />
    </UiCombobox>
  );
};

export const Combobox = ({
  ref,
  id,
  value,
  onValueChange,
  options,
  onSelect,
  closeOnSelect = true,
  selectedValues,
  renderOption,
  loading = false,
  emptyMessage,
  loadingMessage,
  placeholder = "",
  size = "l",
  invalid = false,
  label,
  message,
  readOnly = false,
  tags = false,
  onSearchChange,
  onTagRemove,
  disabled = false,
  className,
  controlClassName,
  iconLeft,
  embedded = false,
  showChevron,
  onClearTags,
  clearTagsLabel,
  showSelectedCheck = false,
  anchorRef,
  name,
  form,
  required,
  autoComplete,
  onChange,
  onClick,
  onFocus,
  onPointerDown,
  onKeyDown,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...inputRestProps
}: ComboboxProps) => {
  const field = useComboboxField({
    anchorRef,
    closeOnSelect,
    disabled,
    embedded,
    emptyMessage,
    id,
    invalid,
    loading,
    loadingMessage,
    onChange,
    onClick,
    onFocus,
    onKeyDown,
    onPointerDown,
    onSearchChange,
    onSelect,
    onTagRemove,
    onValueChange,
    options,
    readOnly,
    ref,
    renderOption,
    selectedValues,
    showChevron,
    showSelectedCheck,
    tags,
    value,
  });

  const {
    activeOptionId,
    controlAnchorRef,
    controlId,
    controlState,
    handleInputChange,
    handleInputClick,
    handleInputFocus,
    handleInputKeyDown,
    handleInputPointerDown,
    hasSelectedTags,
    open,
    rootRef,
    setInputRef,
  } = field;

  const labelId = `${controlId}-label`;
  const messageId = `${controlId}-message`;
  const hasLabel = isPresentNode(label);
  const hasMessage = isPresentNode(message);

  const inputProps: ComboboxInputProps = {
    "aria-activedescendant": activeOptionId,
    "aria-describedby":
      resolveDescribedBy(hasMessage, messageId, ariaDescribedBy) || undefined,
    "aria-expanded": open,
    "aria-invalid": invalid ? true : ariaInvalid,
    "aria-label": ariaLabel,
    "aria-labelledby": resolveLabelledBy(
      ariaLabelledBy,
      hasLabel,
      ariaLabel,
      labelId
    ),
    disabled,
    id: controlId,
    onChange: handleInputChange,
    onClick: handleInputClick,
    onFocus: handleInputFocus,
    onKeyDown: handleInputKeyDown,
    onPointerDown: handleInputPointerDown,
    placeholder,
    readOnly,
    ref: setInputRef,
  };

  return (
    <div ref={rootRef} className={rootClassName(embedded, className)}>
      {isPresentNode(label) ? (
        <label id={labelId} htmlFor={controlId} className={styles.label}>
          {label}
        </label>
      ) : null}
      <div
        className={fieldControlClassName(
          size,
          controlState,
          embedded,
          controlClassName
        )}
        ref={controlAnchorRef}
        data-calendar-combobox-control=""
        data-calendar-combobox-mode={embedded ? "embedded" : "standalone"}
        data-calendar-combobox-state={controlState}
      >
        {isPresentNode(iconLeft) && (!tags || !hasSelectedTags) ? (
          <span aria-hidden="true" className={styles.iconLeft}>
            {iconLeft}
          </span>
        ) : null}

        {tags ? (
          <ComboboxTagsBody
            autoComplete={autoComplete}
            clearTagsLabel={clearTagsLabel}
            disabled={disabled}
            embedded={embedded}
            field={field}
            form={form}
            inputProps={inputProps}
            inputValue={value}
            name={name}
            onClearTags={onClearTags}
            readOnly={readOnly}
            required={required}
          />
        ) : (
          <ComboboxSingleBody
            autoComplete={autoComplete}
            disabled={disabled}
            field={field}
            form={form}
            inputProps={inputProps}
            inputRestProps={inputRestProps}
            inputValue={value}
            name={name}
            readOnly={readOnly}
            required={required}
          />
        )}
      </div>

      <ComboboxMessage
        invalid={invalid}
        message={message}
        messageId={messageId}
      />
    </div>
  );
};

Combobox.displayName = "Combobox";
