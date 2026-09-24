import { createContext } from "react";

interface ConflictIndicatorItemClasses {
  readonly warning?: string;
  readonly error?: string;
}

export const conflictIndicatorItemClassesContext =
  createContext<ConflictIndicatorItemClasses>({});
