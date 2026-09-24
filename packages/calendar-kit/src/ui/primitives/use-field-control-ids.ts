import { useId } from "react";
import type { ReactNode } from "react";

import { isPresentNode } from "./react-node-text";

interface FieldControlIdsInput {
  readonly id: string | undefined;
  readonly label: ReactNode;
  readonly message: ReactNode;
  readonly ariaDescribedBy: string | undefined;
  readonly ariaLabel: string | undefined;
  readonly ariaLabelledBy: string | undefined;
}

export const useFieldControlIds = ({
  ariaDescribedBy,
  ariaLabel,
  ariaLabelledBy,
  id,
  label,
  message,
}: FieldControlIdsInput) => {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hasLabel = isPresentNode(label);
  const hasMessage = isPresentNode(message);
  const labelId = `${controlId}-label`;
  const messageId = `${controlId}-message`;

  return {
    controlId,
    describedBy: [ariaDescribedBy, hasMessage ? messageId : undefined]
      .filter(Boolean)
      .join(" "),
    hasLabel,
    hasMessage,
    labelId,
    labelledBy:
      ariaLabelledBy ??
      (hasLabel && ariaLabel === undefined ? labelId : undefined),
    messageId,
  };
};
