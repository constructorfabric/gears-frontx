// @cpt-FEATURE:cpt-frontx-feature-cli-scaffolding:p1
// @cpt-constraint:cpt-frontx-constraint-cli-template-independence:p1
//
// SCOPE DECISION (implementation-side; the architecture does not fix it):
// `seed`'s own FEATURE text ("Seed a New or Empty Repository") assumes a
// concept — "the CLI's built-in official default origins" — that no module
// in this codebase declares anywhere else. `seed` accepts
// ONLY these defaults (nothing else can be registered against yet, by the
// flow's own error scenario), so SOME concrete list has to exist for `seed`
// to be implementable at all.
//
// That list is NOT authored here. It is generated into
// `../generated/official-defaults.ts` at build time by
// `scripts/generate-cli-official-defaults.mjs`, from whatever template
// territory the checkout carries, discovered by manifest presence
// (ADR-0018) — because `cpt-frontx-constraint-cli-template-independence`
// (CLI-1) forbids a hardcoded template package name anywhere in
// `packages/cli/src`, and `arch:check` fails on one. A hand-written map naming
// a template is exactly the compile-time dependency that boundary exists to
// prevent; see the generator's own header for the full reasoning and for the
// known limitation a generated `path:` origin carries for a published CLI.
//
// Template territory is not in this repository: templates are published from
// a repository of their own and acquired by source-spec
// (`cpt-frontx-adr-template-acquisition-and-location`). The generator finds
// none in this checkout, so the generated map is EMPTY, `list` reports an
// empty `defaults` set, and `seed` — which accepts official defaults and
// nothing else — is unusable until a default origin exists to generate from.
// That is the consequence CLI DESIGN states as the third of its architectural
// facts, not a defect in this module. Nothing here is shaped in anticipation
// of such an origin: once the generator emits one, this module is unchanged.
//
// Keyed by each template's OWN manifest-declared `name` (the identity
// `register`/`apply`/`uniformApply` key every other lookup in this feature
// by) — never by a short alias or a directory name — so a batch entry
// resolves unambiguously to the same identity `list`/`register` would report
// for it once installed.
import { OFFICIAL_DEFAULT_TEMPLATES } from '../generated/official-defaults';
import { getOwn } from '../own-record';

export { OFFICIAL_DEFAULT_TEMPLATES };

/**
 * The registered origin for `name`, when `name` is one of the CLI's official
 * default templates (see this file's own header for what that list is, is
 * not, and where it comes from) — `undefined` otherwise, which
 * `seedRepository` (`./seed-repository.ts`) treats as "not an official
 * default" and refuses with `TEMPLATE_NOT_REGISTERED`.
 */
export function officialDefaultOrigin(name: string): string | undefined {
  return getOwn(OFFICIAL_DEFAULT_TEMPLATES, name);
}
