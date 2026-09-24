import { createContext, useContext, useId, useMemo } from "react";

interface ModalContextValue {
  readonly open: boolean;
  readonly requestClose: () => void;
}

export const ModalContext = createContext<ModalContextValue | null>(null);

export const useModalContext = (): ModalContextValue => {
  const context = useContext(ModalContext);

  if (!context) {
    throw new Error("Modal content must be rendered inside a modal root.");
  }
  return context;
};

export interface ModalContentIds {
  readonly titleId: string;
  readonly descriptionId: string;
}

export const ModalContentContext = createContext<ModalContentIds | null>(null);

export const useModalContentIds = (
  titleId: string | undefined,
  descriptionId: string | undefined
): ModalContentIds => {
  const generatedTitleId = useId();
  const generatedDescriptionId = useId();

  return useMemo(
    () => ({
      descriptionId: descriptionId ?? generatedDescriptionId,
      titleId: titleId ?? generatedTitleId,
    }),
    [descriptionId, generatedDescriptionId, generatedTitleId, titleId]
  );
};
