import { isValidElement } from "react";
import type { ReactNode } from "react";

const isNodeArray = (value: ReactNode): value is ReactNode[] =>
  Array.isArray(value);

const isTextNode = (node: ReactNode): node is string | number | bigint =>
  (node ?? null) !== null &&
  node !== false &&
  node !== true &&
  !isValidElement(node);

export const isPresentNode = (node: ReactNode): boolean =>
  (node ?? null) !== null && node !== false && node !== "";

export const flattenNodeList = (node: ReactNode): ReactNode[] => {
  const flattened: ReactNode[] = [];

  const visit = (child: ReactNode): void => {
    if (isNodeArray(child)) {
      for (const nested of child) {
        visit(nested);
      }
      return;
    }

    if ((child ?? null) !== null && typeof child !== "boolean") {
      flattened.push(child);
    }
  };

  visit(node);

  return flattened;
};

export const textFromNode = (node: ReactNode): string => {
  let text = "";

  for (const child of flattenNodeList(node)) {
    if (isTextNode(child)) {
      text += String(child);
    }
  }

  return text;
};

export const hasRenderableContent = (node: ReactNode): boolean => {
  let hasElement = false;
  let text = "";

  for (const child of flattenNodeList(node)) {
    if (isValidElement(child)) {
      hasElement = true;
    } else if (isTextNode(child)) {
      text += String(child);
    }
  }

  return hasElement || text.trim() !== "";
};
