export const setShadowTheme = (
  root: ShadowRoot,
  theme: "light" | "dark"
): void => {
  if (root.host instanceof HTMLElement) {
    root.host.dataset.theme = theme;
  }
};
