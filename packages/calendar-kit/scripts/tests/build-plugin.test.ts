import type { PreRenderedAsset, PreRenderedChunk } from "rollup";
import { describe, expect as assert, it } from "vitest";

import {
  createOutputFileNames,
  ensureDeclarationSpecifierExtension,
  resolveChunkName,
  resolveManualChunkName,
} from "../build-plugin";

const chunk = (
  name: string,
  moduleIds: readonly string[],
  isEntry = false
): PreRenderedChunk => ({
  exports: [],
  facadeModuleId: null,
  isDynamicEntry: false,
  isEntry,
  isImplicitEntry: false,
  moduleIds: [...moduleIds],
  name,
  type: "chunk",
});

const asset = (name: string): PreRenderedAsset => {
  const legacyFields = { name, originalFileName: name };
  const currentFields = {
    names: [name],
    originalFileNames: [name],
    source: "",
    type: "asset" as const,
  };
  return Object.assign(currentFields, legacyFields);
};

describe("calendar build chunk names", () => {
  it("names a shared UI chunk and its CSS after the owning family", () => {
    const outputFileNames = createOutputFileNames();

    const sharedChunk = chunk("public", [
      "/workspace/packages/calendar-kit/src/ui/conflict-indicator/conflict-indicator.tsx",
    ]);

    assert(resolveChunkName(sharedChunk)).toBe("conflict-indicator");
    assert(outputFileNames.chunkFileNames(sharedChunk)).toBe(
      "chunks/conflict-indicator.js"
    );
    assert(outputFileNames.assetFileNames(asset("public.css"))).toBe(
      "chunks/conflict-indicator.[hash][extname]"
    );
  });

  it("assigns every UI module to its owning family before chunk rendering", () => {
    const conflictModule =
      "/workspace/packages/calendar-kit/src/ui/conflict-indicator/conflict-indicator.tsx";
    const conflictCss =
      "/workspace/packages/calendar-kit/src/ui/conflict-indicator/conflict-indicator.module.css";
    const agendaModule =
      "/workspace/packages/calendar-kit/src/ui/agenda-view/agenda-view.tsx";
    const agendaCss =
      "/workspace/packages/calendar-kit/src/ui/agenda-view/agenda-view.module.css";
    const primitiveCss =
      "/workspace/packages/calendar-kit/src/ui/primitives/button/button.module.css";

    assert(resolveManualChunkName(conflictModule)).toBe("conflict-indicator");
    assert(resolveManualChunkName(conflictCss)).toBe("conflict-indicator");
    assert(resolveManualChunkName(agendaModule)).toBe("agenda-view");
    assert(resolveManualChunkName(agendaCss)).toBe("agenda-view");
    assert(resolveManualChunkName(primitiveCss)).toBe("button");
    assert(
      resolveManualChunkName(
        "/workspace/packages/calendar-kit/src/core/public.ts"
      )
    ).toBeUndefined();
    assert(
      resolveManualChunkName(
        "/workspace/packages/calendar-kit/src/react/public.ts"
      )
    ).toBeUndefined();
  });

  it("rejects a chunk containing CSS modules from different UI families", () => {
    const conflictCss =
      "/workspace/packages/calendar-kit/src/ui/conflict-indicator/conflict-indicator.module.css";
    const agendaCss =
      "/workspace/packages/calendar-kit/src/ui/agenda-view/agenda-view.module.css";

    assert(() =>
      resolveChunkName(chunk("public", [conflictCss, agendaCss]))
    ).toThrow(
      "Calendar UI families cannot share a chunk: agenda-view, conflict-indicator"
    );
    assert(resolveChunkName(chunk("public", [conflictCss]))).toBe(
      "conflict-indicator"
    );
    assert(resolveChunkName(chunk("public", [agendaCss]))).toBe("agenda-view");
  });

  it("keeps core and React shared chunks named after their source modules", () => {
    assert(
      resolveChunkName(
        chunk("public", [
          "/workspace/packages/calendar-kit/src/core/validation.ts",
        ])
      )
    ).toBe("validation");
    assert(
      resolveChunkName(
        chunk("public", [
          "/workspace/packages/calendar-kit/src/react/controllers/use-week-grid-controller.ts",
        ])
      )
    ).toBe("use-week-grid-controller");
  });

  it("preserves entry names and rejects an untraceable public chunk", () => {
    assert(resolveChunkName(chunk("week-grid", ["src/index.ts"], true))).toBe(
      "week-grid"
    );
    assert(resolveChunkName(chunk("fallback", ["src/shared.ts"]))).toBe(
      "fallback"
    );
    assert(() => resolveChunkName(chunk("public", ["src/shared.ts"]))).toThrow(
      "Unable to name a public calendar chunk"
    );

    assert(() =>
      createOutputFileNames().assetFileNames(asset("public.css"))
    ).toThrow("Calendar build cannot emit a public asset chunk");
  });
});

describe("calendar declaration specifiers", () => {
  it("gives directory specifiers an explicit index extension", () => {
    assert(ensureDeclarationSpecifierExtension("../..")).toBe(
      "../../index.js"
    );
    assert(ensureDeclarationSpecifierExtension("..")).toBe("../index.js");
    assert(ensureDeclarationSpecifierExtension(".")).toBe("./index.js");
    assert(ensureDeclarationSpecifierExtension("../../index")).toBe(
      "../../index.js"
    );
  });

  it("maps trailing-slash directory specifiers to their index file", () => {
    assert(ensureDeclarationSpecifierExtension("./")).toBe("./index.js");
    assert(ensureDeclarationSpecifierExtension("../")).toBe("../index.js");
    assert(ensureDeclarationSpecifierExtension("../../ui/")).toBe(
      "../../ui/index.js"
    );
  });

  it("leaves already resolved specifiers untouched", () => {
    assert(ensureDeclarationSpecifierExtension("./week-grid.js")).toBe(
      "./week-grid.js"
    );
    assert(ensureDeclarationSpecifierExtension("../styles/theme.css")).toBe(
      "../styles/theme.css"
    );
    assert(
      ensureDeclarationSpecifierExtension("../data/catalog.json")
    ).toBe("../data/catalog.json");
    assert(ensureDeclarationSpecifierExtension("../theme.css?raw")).toBe(
      "../theme.css?raw"
    );
    assert(ensureDeclarationSpecifierExtension("../../react/slots")).toBe(
      "../../react/slots.js"
    );
  });
});
