import { describe, expect, it } from "vitest";

const stylesheets = import.meta.glob<string>("../../ui/**/*.module.css", {
  eager: true,
  import: "default",
  query: "?raw",
});

// The agenda accent has no upstream token.
const ALLOWED = new Set(["#7498f8"]);

const rawColours = (css: string): string[] =>
  (css.match(/#[0-9a-fA-F]{3,8}\b|(?:rgb|rgba|hsl|hsla)\(/gu) ?? []).filter(
    (literal) => !ALLOWED.has(literal)
  );

describe("component stylesheets", () => {
  it("loads every component stylesheet", () => {
    expect(Object.keys(stylesheets).length).toBeGreaterThan(20);

    for (const css of Object.values(stylesheets)) {
      expect(css).not.toBe("");
    }
  });

  it.each(Object.entries(stylesheets))(
    "%s takes colour from theme tokens only",
    (_path, css) => {
      expect(rawColours(css)).toStrictEqual([]);
    }
  );
});
