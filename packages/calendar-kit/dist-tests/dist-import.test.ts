// Probe used by the dist-import gate: import the built package under Vitest/jsdom.
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const DIST = path.resolve(import.meta.dirname, "../dist");

const isModuleExports = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

const JS_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)["'](?<specifier>\.\.?\/[^"']+)["']/gu;

// Rollup splits each family from its controller chunk, so a family chunk and the
// controller it owns can import each other. ESM tolerates that cycle, but the
// set is fixed by the chunking rules: any new cycle means the split changed.
const chunkCycles = (): readonly string[] => {
  const graph = new Map<string, readonly string[]>();

  for (const file of fs.globSync("**/*.js", { cwd: DIST })) {
    const absolute = path.join(DIST, file);
    const imports = [...fs.readFileSync(absolute, "utf-8").matchAll(JS_IMPORT)]
      .map((match) =>
        path.resolve(path.dirname(absolute), match.groups?.specifier ?? "")
      )
      .filter((target) => fs.existsSync(target));

    graph.set(absolute, imports);
  }

  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  let counter = 0;

  const visit = (node: string): void => {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);

    for (const next of graph.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node) ?? 0, low.get(next) ?? 0));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node) ?? 0, index.get(next) ?? 0));
      }
    }

    if (low.get(node) !== index.get(node)) {
      return;
    }

    const component: string[] = [];
    let member = stack.pop();

    while (member !== undefined) {
      onStack.delete(member);
      component.push(member);
      if (member === node) {
        break;
      }
      member = stack.pop();
    }

    components.push(component);
  };

  for (const node of graph.keys()) {
    if (!index.has(node)) {
      visit(node);
    }
  }

  return components
    .filter((component) => component.length > 1)
    .map((component) =>
      component
        .map((file) => path.relative(DIST, file))
        .sort()
        .join(" <-> ")
    )
    .sort();
};

describe("dist runtime import", () => {
  it("imports the built package and its family entries", async () => {
    const root: unknown = await import("../dist/index.js");
    if (!isModuleExports(root)) {
      throw new Error(
        "Expected the built root entry to export a module object"
      );
    }
    expect(Object.keys(root).length).toBeGreaterThan(50);
    await Promise.all(
      [
        "create-event",
        "event-detail-panel",
        "week-grid",
        "month-grid",
        "world-clocks",
        "i18n",
      ].map(async (entry) => {
        const moduleExports: unknown = await import(`../dist/${entry}.js`);
        if (!isModuleExports(moduleExports)) {
          throw new Error(`Expected ${entry} to export a module object`);
        }
        expect(Object.keys(moduleExports).length).toBeGreaterThan(0);
      })
    );
  });

  it("keeps chunk cycles to the two known family/controller pairs", () => {
    expect(chunkCycles()).toStrictEqual([
      "chunks/agenda-view.js <-> chunks/use-agenda-view-controller.js",
      "chunks/search-results.js <-> chunks/use-search-results-controller.js",
    ]);
  });
});
