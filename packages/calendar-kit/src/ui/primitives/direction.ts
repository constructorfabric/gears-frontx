export const resolveDirection = (node: Element): "ltr" | "rtl" => {
  let current: Element | null = node;

  while (current !== null) {
    const direction = current.getAttribute("dir");

    if (direction === "rtl" || direction === "ltr") {
      return direction;
    }

    if (current.parentElement !== null) {
      current = current.parentElement;
      continue;
    }

    const root = current.getRootNode();
    current = root instanceof ShadowRoot ? root.host : null;
  }

  return document.documentElement.dir === "rtl" ? "rtl" : "ltr";
};
