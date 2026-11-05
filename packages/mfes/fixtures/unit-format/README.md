# Unit-format fixture packages

Source fixture packages shipped with `@gears-frontx/mfes` for conformance
testing of the shared-dependency unit format contract
(`packages/mfes/architecture/features/unit-format-contract/FEATURE.md`). A
producer implementation consumes these to demonstrate that its output passes
`UnitFormatConformance`; the package's own tests exercise
`UnitFormatConformance` directly.

- `esm-cycle` — an ESM package with an import cycle: `a.js` and `b.js`
  import each other, so the producing build must emit them as one unit (one
  strongly connected component).
- `cjs-package` — a CommonJS package; the producing build must emit it as
  exactly one unit.
- `barrel-package` — an ESM package whose `index.js` is a pure barrel
  re-exporting `./a.js` and `./b.js`.
- `subpath-import` — an ESM package imported through a subpath export
  (`./feature` in addition to `.`).
