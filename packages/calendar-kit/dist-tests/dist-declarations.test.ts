import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const DIST = path.resolve(import.meta.dirname, "../dist");

const RELATIVE_SPECIFIER =
  /(?:\bfrom\s+|\bimport\s*\(\s*)["'](?<specifier>\.\.?\/[^"']+)["']/gu;

const declarationFiles = (): readonly string[] =>
  fs.globSync("**/*.d.ts", { cwd: DIST }).sort();

const specifiersOf = (file: string): readonly string[] => [
  ...fs
    .readFileSync(path.join(DIST, file), "utf-8")
    .matchAll(RELATIVE_SPECIFIER),
].map((match) => match.groups?.specifier ?? "");

const resolves = (fromFile: string, specifier: string): boolean => {
  const target = path.resolve(DIST, path.dirname(fromFile), specifier);
  const candidates = specifier.endsWith(".js")
    ? [target, `${target.slice(0, -".js".length)}.d.ts`]
    : [`${target}.d.ts`, `${target}.js`, `${target}.css`, `${target}.json`];

  return candidates.some((candidate) => fs.existsSync(candidate));
};

describe("dist declarations", () => {
  it("resolves every relative declaration specifier", () => {
    const files = declarationFiles();
    expect(files.length).toBeGreaterThan(0);

    const unresolved = files.flatMap((file) =>
      specifiersOf(file)
        .filter((specifier) => !resolves(file, specifier))
        .map((specifier) => `${file} -> ${specifier}`)
    );

    expect(unresolved).toStrictEqual([]);
  });

  it("keeps every relative declaration specifier explicitly extended", () => {
    const extensionless = declarationFiles().flatMap((file) =>
      specifiersOf(file)
        .filter((specifier) => !/\.[a-z]+$/u.test(specifier))
        .map((specifier) => `${file} -> ${specifier}`)
    );

    expect(extensionless).toStrictEqual([]);
  });
});
