import { describe, expect, it } from "vitest";

import { ENGLISH_TRANSLATIONS, englishTranslationFor } from "../english";

const IDS = Object.keys(ENGLISH_TRANSLATIONS);
const PLURAL_SUFFIX = /_(?<category>one|other)$/u;
describe("bundled English", () => {
  it("carries the whole catalogue under dotted ids", () => {
    expect(IDS.length).toBeGreaterThan(200);

    for (const id of IDS) {
      expect(id).toMatch(/^calendar\.[A-Za-z0-9_.]+$/u);
      expect(ENGLISH_TRANSLATIONS[id]?.trim()).not.toBe("");
    }
  });

  it("pairs every plural form, and never repeats one", () => {
    const bases = [
      ...new Set(
        IDS.filter((id) => PLURAL_SUFFIX.test(id)).map((id) =>
          id.replace(PLURAL_SUFFIX, "")
        )
      ),
    ];

    expect(bases.length).toBeGreaterThan(5);

    for (const base of bases) {
      const one = ENGLISH_TRANSLATIONS[`${base}_one`];
      const other = ENGLISH_TRANSLATIONS[`${base}_other`];

      expect(other).toBeTypeOf("string");
      // A form that would read the same for every count belongs in one bare key.
      expect(one).not.toBe(other);
    }
  });

  it("resolves a family that reads the same for every count", () => {
    const bare = IDS.filter(
      (id) => id.startsWith("calendar.detail.rsvp.") && !PLURAL_SUFFIX.test(id)
    );

    expect(bare.length).toBeGreaterThan(0);

    for (const id of bare) {
      const one = englishTranslationFor(id, { count: 1 }, "en-US") ?? "";
      const three = englishTranslationFor(id, { count: 3 }, "en-US") ?? "";

      // One key serves every count, so the two readings differ only by the number.
      expect(one).not.toBe(id);
      expect(one.replace("1", "")).toBe(three.replace("3", ""));
    }
  });

  it("counts in English whatever the requested locale", () => {
    expect(
      englishTranslationFor("calendar.month.eventCount", { count: 0 }, "fr")
    ).toBe("0 events");
  });

  it("resolves an unknown id to nothing, so the caller reports it", () => {
    expect(
      englishTranslationFor("calendar.nothing.here", undefined, "en-US")
    ).toBeUndefined();
  });
});
