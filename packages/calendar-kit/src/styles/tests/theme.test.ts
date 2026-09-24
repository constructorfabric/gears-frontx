import { describe, expect as assert, it } from "vitest";

import { declarations } from "../../__test-utils__/css-declarations";
import { sortCopy } from "../../core/array";
import {
  ALERT_DIALOG_Z_INDEX,
  ALL_DAY_BAND_Z_INDEX,
  DAY_NUMBER_BAND_Z_INDEX,
  NOW_LINE_Z_INDEX,
  OVERLAY_Z_INDEX,
} from "../../core/layout";

import themeCss from "../theme.css?raw";
import onecloudCss from "../themes/onecloud.css?raw";

const ALIASES = {
  "--cal-border-conflict": "--border-strong",
  "--cal-border-event": "--border",
  "--cal-border-ring-inset": "--ring-inset",
  "--cal-border-width-1": "--border-width",
  "--cal-border-width-focus": "--border-width-focus",
  "--cal-color-action": "--primary",
  "--cal-color-action-foreground": "--primary-foreground",
  "--cal-color-conflict": "--danger",
  "--cal-color-divider": "--divider",
  "--cal-color-error": "--destructive",
  "--cal-color-error-foreground": "--destructive-foreground",
  "--cal-color-focus-ring": "--ring",
  "--cal-color-focus-ring-strong": "--primary-ring",
  "--cal-color-grid-line": "--border",
  "--cal-color-grid-line-strong": "--border-strong",
  "--cal-color-info": "--info",
  "--cal-color-input": "--input",
  "--cal-color-input-disabled": "--muted",
  "--cal-color-muted": "--muted-foreground",
  "--cal-color-now": "--now",
  "--cal-color-now-label": "--now-label",
  "--cal-color-orange-accent": "--warning",
  "--cal-color-orange-background": "--warning-soft",
  "--cal-color-orange-border": "--warning",
  "--cal-color-orange-foreground": "--warning",
  "--cal-color-orange-pattern": "--warning",
  "--cal-color-overlay-border": "--popover-border",
  "--cal-color-overlay-surface": "--popover",
  "--cal-color-placeholder": "--placeholder-foreground",
  "--cal-color-purple-accent": "--accent-foreground",
  "--cal-color-purple-background": "--accent",
  "--cal-color-purple-border": "--accent-foreground",
  "--cal-color-purple-foreground": "--accent-foreground",
  "--cal-color-purple-pattern": "--accent",
  "--cal-color-raised": "--surface-elevated",
  "--cal-color-scrim": "--overlay",
  "--cal-color-selection": "--selection-subtle",
  "--cal-color-subtle": "--subtle-foreground",
  "--cal-color-success": "--success",
  "--cal-color-surface": "--surface",
  "--cal-color-text": "--foreground",
  "--cal-color-turquoise-accent": "--info",
  "--cal-color-turquoise-background": "--info-soft",
  "--cal-color-turquoise-border": "--info",
  "--cal-color-turquoise-foreground": "--info",
  "--cal-color-turquoise-pattern": "--info",
  "--cal-color-warning": "--warning",
  "--cal-control-height-lg": "--control-height-lg",
  "--cal-control-height-md": "--control-height-md",
  "--cal-control-height-sm": "--control-height-sm",
  "--cal-focus-ring-width": "--border-width-focus",
  "--cal-font-family": "--font-sans",
  "--cal-icon-size-lg": "--icon-size-lg",
  "--cal-icon-size-md": "--icon-size-md",
  "--cal-icon-size-sm": "--icon-size-sm",
  "--cal-icon-size-xs": "--icon-size-xs",
  "--cal-radius-lg": "--radius-lg",
  "--cal-radius-md": "--radius-md",
  "--cal-radius-slot": "--radius-xs",
  "--cal-radius-sm": "--radius-sm",
  "--cal-shadow-drag": "--popover-shadow",
  "--cal-shadow-overlay": "--popover-shadow",
  "--cal-shadow-panel": "--popover-shadow",
  "--cal-slot-dragging": "--accent",
  "--cal-slot-dragging-foreground": "--accent-foreground",
  "--cal-slot-dragging-ring": "--primary-ring",
  "--cal-slot-selected": "--selection-subtle",
  "--cal-slot-selected-foreground": "--foreground",
  "--cal-slot-selected-ring": "--ring",
  "--cal-slot-unavailable": "--muted",
  "--cal-slot-unavailable-foreground": "--muted-foreground",
  "--cal-slot-unavailable-ring": "--border-strong",
  "--cal-space-1": "--space-1",
  "--cal-space-2": "--space-2",
  "--cal-space-3": "--space-3",
  "--cal-space-4": "--space-4",
  "--cal-space-5": "--space-5",
  "--cal-space-6": "--space-6",
  "--cal-space-8": "--space-8",
  "--cal-state-active": "--primary",
  "--cal-state-disabled": "--muted",
  "--cal-state-dragging": "--accent",
  "--cal-state-focus": "--ring",
  "--cal-state-hover": "--card-hover",
  "--cal-state-read-only": "--muted-foreground",
  "--cal-text-caption-line-height": "--text-caption-line-height",
  "--cal-text-caption-size": "--text-caption-size",
  "--cal-text-caption-tracking": "--text-caption-tracking",
  "--cal-text-caption-weight": "--text-caption-weight",
  "--cal-text-day-number-line-height": "--text-body-line-height",
  "--cal-text-day-number-size": "--text-body-size",
  "--cal-text-day-number-tracking": "--text-body-tracking",
  "--cal-text-day-number-weight": "--text-body-weight",
  "--cal-text-grid-line-height": "--text-body-line-height",
  "--cal-text-grid-size": "--text-body-size",
  "--cal-text-grid-tracking": "--text-body-tracking",
  "--cal-text-grid-weight": "--text-body-weight",
  "--cal-text-heading-line-height": "--text-heading-1-line-height",
  "--cal-text-heading-size": "--text-heading-1-size",
  "--cal-text-heading-tracking": "--text-heading-1-tracking",
  "--cal-text-heading-weight": "--text-heading-1-weight",
  "--cal-text-label-line-height": "--text-label-line-height",
  "--cal-text-label-size": "--text-label-size",
  "--cal-text-label-tracking": "--text-label-tracking",
  "--cal-text-label-weight": "--text-label-weight",
  "--cal-text-meta-line-height": "--text-meta-line-height",
  "--cal-text-meta-size": "--text-meta-size",
  "--cal-text-meta-tracking": "--text-meta-tracking",
  "--cal-text-meta-weight": "--text-meta-weight",
  "--cal-text-title-line-height": "--text-heading-2-line-height",
  "--cal-text-title-size": "--text-heading-2-size",
  "--cal-text-title-tracking": "--text-heading-2-tracking",
  "--cal-text-title-weight": "--text-heading-2-weight",
} as const;

const FALLBACKS = new Map<string, string>([
  ["--foreground", "#0f172a"],
  ["--muted-foreground", "#64748b"],

  ["--placeholder-foreground", "#bbbbbb"],

  ["--divider", "rgb(0 0 0 / 0.09)"],
  ["--border", "#64748b"],
  ["--ring", "#8b5cf6"],
  ["--primary", "#8257e6"],
  ["--text-heading-1-size", "1.125rem"],
  ["--text-heading-1-line-height", "1.5rem"],
  ["--text-heading-1-weight", "600"],
  ["--text-heading-1-tracking", "-0.1px"],
  ["--text-label-size", "0.875rem"],
  ["--text-label-line-height", "1.25rem"],
  ["--text-label-weight", "500"],
  ["--text-label-tracking", "0px"],
  ["--now", "var(--primary, #8257e6)"],
  ["--now-label", "var(--primary-foreground, #ffffff)"],
  ["--primary-foreground", "#ffffff"],
  ["--popover", "#ffffff"],
  ["--input", "#cbd5e1"],
  ["--muted", "#f1f5f9"],
  ["--destructive", "#e11d48"],
  ["--destructive-foreground", "#ffffff"],
  ["--success", "#059669"],
  ["--warning", "#d97706"],
  ["--info", "#0284c7"],
  ["--accent", "#f3e8ff"],
  ["--accent-foreground", "#6d28d9"],
  ["--font-sans", "'Inter', sans-serif"],
  ["--radius-sm", "0.375rem"],
  ["--radius-md", "0.5rem"],
  ["--radius-lg", "0.75rem"],
  ["--surface", "#ffffff"],
  ["--surface-elevated", "#ffffff"],
  ["--subtle-foreground", "#5f6f88"],
  ["--border-strong", "#475569"],
  ["--primary-ring", "#6d28d9"],
  ["--danger", "#e11d48"],
  [
    "--popover-border",
    "color-mix(in oklab, var(--foreground, #0f172a) 10%, transparent)",
  ],
  ["--overlay", "oklch(0 0 0 / 50%)"],
  ["--selection-subtle", "#dce7f2"],
  ["--info-soft", "#eaf6ff"],
  ["--warning-soft", "#fdf3e2"],
  ["--text-heading-2-size", "1rem"],
  ["--text-heading-2-line-height", "1.5rem"],
  ["--text-heading-2-weight", "600"],
  ["--text-heading-2-tracking", "-0.1px"],
  ["--text-meta-size", "0.75rem"],
  ["--text-meta-line-height", "1rem"],
  ["--text-meta-weight", "400"],
  ["--text-meta-tracking", "0.1px"],
  ["--text-caption-size", "0.625rem"],
  ["--text-caption-line-height", "0.75rem"],
  ["--text-caption-weight", "500"],
  ["--text-caption-tracking", "0px"],
  ["--text-body-size", "0.9375rem"],
  ["--text-body-line-height", "1.25rem"],
  ["--text-body-weight", "400"],
  ["--text-body-tracking", "0px"],
  ["--space-1", "0.25rem"],
  ["--space-2", "0.5rem"],
  ["--space-3", "0.75rem"],
  ["--space-4", "1rem"],
  ["--space-5", "1.25rem"],
  ["--space-6", "1.5rem"],
  ["--space-8", "2rem"],
  ["--border-width", "1px"],
  ["--border-width-focus", "2px"],
  ["--ring-inset", "1px"],
  ["--radius-xs", "4px"],
  [
    "--popover-shadow",
    "0 4px 6px -1px var(--cal-color-overlay-border), 0 2px 4px -2px var(--cal-color-overlay-border)",
  ],
  ["--control-height-sm", "2rem"],
  ["--control-height-md", "2.25rem"],
  ["--control-height-lg", "2.5rem"],
  ["--icon-size-xs", "0.75rem"],
  ["--icon-size-sm", "1rem"],
  ["--icon-size-md", "1.25rem"],
  ["--icon-size-lg", "1.5rem"],
  ["--card-hover", "#f8fafc"],
]);

const OWNED = {
  "--cal-layer-alert": "50",
  "--cal-layer-all-day-band": "30",
  "--cal-layer-day-number-band": "31",
  "--cal-layer-now-line": "20",
  "--cal-layer-overlay": "40",
  "--cal-motion-duration-long": "320ms",
  "--cal-motion-duration-medium": "200ms",
  "--cal-motion-duration-short": "120ms",
  "--cal-radius-pill": "9999px",
} as const;

const FORBIDDEN_GEOMETRY =
  /--cal-(?:hour-height|gutter-width|header-height|all-day-chip-height|event-inset|agenda-|side-panel-|border-style|direction-sign)/u;

const RAW_PALETTE = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(?:white|black)\b/iu;

const normalizeCssValue = (value: string | undefined): string | undefined =>
  value
    ?.replaceAll(/\s+/gu, " ")
    .replaceAll("var( ", "var(")
    .replaceAll(" )", ")")
    .replaceAll('"', "'")
    .trim();

const upstreamSeams = (css: string): string[] => {
  const seams = new Set<string>();

  for (const match of css.matchAll(/var\(\s*(?<group1>--[a-z0-9-]+)\s*,/giu)) {
    seams.add(match[1]);
  }

  return sortCopy([...seams]);
};

const mediaContents = (css: string, marker: string): string => {
  const start = css.indexOf(marker);

  if (start === -1) {
    return "";
  }

  const nextMedia = css.indexOf("@media", start + marker.length);

  const block = css.slice(start, nextMedia === -1 ? css.length : nextMedia);
  const firstBrace = block.indexOf("{");
  const lastBrace = block.lastIndexOf("}");

  return firstBrace === -1
    ? ""
    : block.slice(firstBrace + 1, lastBrace === -1 ? block.length : lastBrace);
};

describe("calendar theme contract", () => {
  it("loads a non-empty stylesheet through the static raw import", () => {
    assert(themeCss.trim().length).toBeGreaterThan(0);
  });

  it("ships the semantic alias map with no missing or renamed token", () => {
    const tokens = declarations(themeCss, "[data-theme]");

    for (const [calendarToken, hostToken] of Object.entries(ALIASES)) {
      const fallback = FALLBACKS.get(hostToken);

      const expected =
        fallback === undefined
          ? `var(${hostToken})`
          : `var(${hostToken}, ${fallback})`;

      assert(
        normalizeCssValue(tokens.get(calendarToken)),
        `${calendarToken} is missing`
      ).toBe(expected);
    }
  });

  it("keeps the calendar-owned token table exact with its binding literals", () => {
    const tokens = declarations(themeCss, "[data-theme]");

    for (const [calendarToken, literal] of Object.entries(OWNED)) {
      assert(
        normalizeCssValue(tokens.get(calendarToken)),
        `${calendarToken} is missing`
      ).toBe(literal);
    }
  });

  it("keeps the layer tokens equal to the core/layout z-index constants", () => {
    const tokens = declarations(themeCss, "[data-theme]");

    assert({
      alert: tokens.get("--cal-layer-alert"),
      allDayBand: tokens.get("--cal-layer-all-day-band"),
      dayNumberBand: tokens.get("--cal-layer-day-number-band"),
      nowLine: tokens.get("--cal-layer-now-line"),
      overlay: tokens.get("--cal-layer-overlay"),
    }).toStrictEqual({
      alert: String(ALERT_DIALOG_Z_INDEX),
      allDayBand: String(ALL_DAY_BAND_Z_INDEX),
      dayNumberBand: String(DAY_NUMBER_BAND_Z_INDEX),
      nowLine: String(NOW_LINE_Z_INDEX),
      overlay: String(OVERLAY_Z_INDEX),
    });
  });

  it("rejects any undocumented --cal-* name outside the alias and owned tables", () => {
    const tokens = declarations(themeCss, "[data-theme]");

    for (const token of tokens.keys()) {
      if (!token.startsWith("--cal-")) {
        continue;
      }

      assert(
        [...Object.keys(ALIASES), ...Object.keys(OWNED)],
        `${token} is not in the §2.3 contract`
      ).toContain(token);
    }
  });

  it("never exposes fixed implementation geometry as a public --cal-* token", () => {
    assert(
      [...declarations(themeCss, "[data-theme]").keys()].join("\n")
    ).not.toMatch(FORBIDDEN_GEOMETRY);
  });

  it("gives explicit data-theme values precedence over the dark-scheme fallback", () => {
    const light = declarations(themeCss, "[data-theme]");
    const dark = declarations(
      mediaContents(themeCss, "@media (prefers-color-scheme: dark)"),
      ':root:not([data-theme="light"])'
    );

    assert(light.get("--cal-color-surface")).toBe("var(--surface, #ffffff)");
    assert(dark.get("--cal-color-surface")).toBe("var(--surface, #0f131b)");
  });

  it("uses dark-compatible fallbacks without removing host-token overrides", () => {
    const dark = declarations(
      mediaContents(themeCss, "@media (prefers-color-scheme: dark)"),
      ':root:not([data-theme="light"])'
    );

    assert(dark.get("--cal-color-text")).toBe("var(--foreground, #f8fafc)");
    assert(dark.get("--cal-color-muted")).toBe(
      "var(--muted-foreground, #8d96a8)"
    );
    assert(dark.get("--cal-slot-selected-foreground")).toBe(
      "var(--foreground, #f8fafc)"
    );
    assert(normalizeCssValue(dark.get("--cal-color-overlay-border"))).toBe(
      "var(--popover-border, color-mix(in oklab, var(--foreground, #f8fafc) 10%, transparent))"
    );
  });

  it("keeps forced-colors and every reduced-motion override in their media branches", () => {
    const reducedMotion = declarations(
      mediaContents(themeCss, "@media (prefers-reduced-motion: reduce)"),
      ":root"
    );
    assert(reducedMotion.get("--cal-motion-duration-short")).toBe("0s");
    assert(reducedMotion.get("--cal-motion-duration-medium")).toBe("0s");
    assert(reducedMotion.get("--cal-motion-duration-long")).toBe("0s");
  });

  it("remaps focus, surface, text, disabled, and action semantics to system colors in forced colors", () => {
    const forcedBlock = mediaContents(
      themeCss,
      "@media (forced-colors: active)"
    );

    const forced = declarations(forcedBlock, ":root");
    assert(forced.get("--cal-color-surface")).toBe("Canvas");
    assert(forced.get("--cal-color-text")).toBe("CanvasText");
    assert(forced.get("--cal-color-muted")).toBe("GrayText");
    assert(forced.get("--cal-color-action")).toBe("Highlight");
    assert(forced.get("--cal-color-focus-ring")).toBe("Highlight");
    assert(forced.get("--cal-color-conflict")).toBe("Highlight");
    assert(forced.get("--cal-color-selection")).toBe("Highlight");
    assert(forced.get("--cal-slot-selected-foreground")).toBe("HighlightText");
    assert(forced.get("--cal-color-error")).toBe("Highlight");
    assert(forced.get("--cal-color-error-foreground")).toBe("HighlightText");
  });

  it("keeps raw palette values inside declared alias fallbacks", () => {
    const tokens = declarations(themeCss, "[data-theme]");

    for (const [token, value] of tokens) {
      if (!token.startsWith("--cal-") || value.trim().startsWith("var(")) {
        continue;
      }

      assert(value, `${token} has an undeclared raw palette value`).not.toMatch(
        RAW_PALETTE
      );
    }
  });
});

describe("onecloud theme preset", () => {
  it("defines every upstream seam that theme.css reads through a fallback", () => {
    const seams = upstreamSeams(themeCss);
    const defined = new Set(
      declarations(onecloudCss, '[data-theme="light"]').keys()
    );

    assert(seams.length, "theme.css declares no upstream seam").toBeGreaterThan(
      0
    );

    const missing = seams.filter((seam) => !defined.has(seam));

    assert(
      missing,
      `themes/onecloud.css does not define ${missing.join(", ")}`
    ).toStrictEqual([]);
  });

  it("declares no property that is not an upstream seam of theme.css", () => {
    const seams = new Set(upstreamSeams(themeCss));
    const extra = [
      ...declarations(onecloudCss, '[data-theme="light"]').keys(),
    ].filter((name) => !seams.has(name));

    assert(
      extra,
      `themes/onecloud.css declares non-seam ${extra.join(", ")}`
    ).toStrictEqual([]);
  });

  it("ships literal values so the preset stands alone without host tokens", () => {
    for (const [name, value] of declarations(
      onecloudCss,
      '[data-theme="light"]'
    )) {
      assert(
        value,
        `${name} resolves through another custom property`
      ).not.toMatch(/var\(--/u);
    }
  });

  it("covers the dark scheme the same way theme.css does", () => {
    const darkScheme = declarations(
      mediaContents(onecloudCss, "@media (prefers-color-scheme: dark)"),
      ':root:not([data-theme="light"])'
    );
    assert(darkScheme.get("--surface")).toBe("#111827");
    assert(darkScheme.get("--surface-elevated")).toBe("#1f2937");
  });
});
