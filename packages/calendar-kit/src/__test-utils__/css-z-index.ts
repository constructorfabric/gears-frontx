import { declarations } from "./css-declarations";

import themeCss from "../styles/theme.css?raw";

const layers = declarations(themeCss, "[data-theme]");

const LAYER_REFERENCE =
  /^(?:calc\()?var\((?<token>--cal-layer-[a-z-]+)\)(?: \+ (?<offset>\d+)\))?$/u;

export const cssZIndex = (css: string, selector: string): number => {
  const raw = declarations(css, selector).get("z-index") ?? "";
  const reference = LAYER_REFERENCE.exec(raw)?.groups;

  const value =
    reference === undefined
      ? Number(raw)
      : Number(layers.get(reference.token ?? "")) +
        Number(reference.offset ?? 0);

  if (raw === "" || !Number.isFinite(value)) {
    throw new TypeError(`No numeric z-index for ${selector}`);
  }

  return value;
};
