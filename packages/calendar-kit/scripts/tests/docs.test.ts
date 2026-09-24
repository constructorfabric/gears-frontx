import fs from "node:fs";
import path from "node:path";

import { describe, expect as assert, it } from "vitest";

import { flattenDocLinks, shippedDocs } from "../build-plugin";
import { generateDocs, markdownFiles } from "../docs";

const ROOT = path.resolve(import.meta.dirname, "../..");

const RELATIVE_LINK =
  /\]\((?!https?:|mailto:|#)(?<target>[^)#\s]+)(?:#[^)\s]*)?\)/gu;

describe("docs", () => {
  it("keep their generated regions in step with the source", async () => {
    await assert(generateDocs("check")).resolves.toStrictEqual([]);
  }, 60_000);

  it("link only to files that exist", () => {
    const repoDocs = markdownFiles().filter((file) => file !== "llms.txt");
    const broken = repoDocs.flatMap((file) =>
      [
        ...fs
          .readFileSync(path.join(ROOT, file), "utf-8")
          .matchAll(RELATIVE_LINK),
      ]
        .map((match) => match.groups?.target ?? "")
        .filter(
          (target) =>
            !fs.existsSync(path.join(ROOT, path.dirname(file), target))
        )
        .map((target) => `${file} -> ${target}`)
    );

    assert(broken).toStrictEqual([]);
  });

  it("point llms.txt only at docs the package ships", () => {
    const shipped = new Set([
      ...shippedDocs().map((file) => `dist/docs/${path.basename(file)}`),
      "dist/llms-full.txt",
    ]);
    const targets = [
      ...fs
        .readFileSync(path.join(ROOT, "llms.txt"), "utf-8")
        .matchAll(RELATIVE_LINK),
    ].map((match) => match.groups?.target ?? "");

    assert(targets.length).toBeGreaterThan(20);
    assert(targets.filter((target) => !shipped.has(target))).toStrictEqual([]);
  });

  it("list every seam theme.css reads in the theming reference", () => {
    const theme = fs.readFileSync(
      path.join(ROOT, "src/styles/theme.css"),
      "utf-8"
    );
    const reference = fs.readFileSync(
      path.join(ROOT, "src/styles/theming.md"),
      "utf-8"
    );
    const seams = new Set(
      [...theme.matchAll(/var\((?<seam>--[a-z0-9-]+)/gu)]
        .map((match) => match.groups?.seam ?? "")
        .filter((seam) => !seam.startsWith("--cal-"))
    );

    assert(
      [...seams].filter((seam) => !reference.includes(`\`${seam}\``))
    ).toStrictEqual([]);
  });

  it("flatten repo-relative doc links for the flat dist/docs folder", () => {
    assert(
      flattenDocLinks(
        "[a](../../docs/i18n.md#per-component-overrides) [b](theming.md) [c](https://x.dev/a.md) [d](#top)"
      )
    ).toBe(
      "[a](i18n.md#per-component-overrides) [b](theming.md) [c](https://x.dev/a.md) [d](#top)"
    );
  });
});
