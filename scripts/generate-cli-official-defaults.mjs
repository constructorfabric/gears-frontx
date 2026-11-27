/**
 * Generates the CLI's official-default-template registry
 * (`packages/cli/src/generated/official-defaults.ts`) from this repo's own
 * templates, discovered by manifest presence.
 *
 * WHY THIS IS GENERATED RATHER THAN HAND-WRITTEN. `seed` needs a concrete
 * list of "official default" template identities to be implementable at all
 * (its own flow accepts nothing else, since no `.frontx/project.json` can
 * yet exist for anything to be registered against). But
 * `cpt-frontx-constraint-cli-template-independence` (CLI-1) forbids a
 * hardcoded template package name anywhere in `packages/cli/src` — the whole
 * point of that boundary is that the CLI stays portable to a project with a
 * different set of templates, so a hand-authored map naming
 * `frontx-template-shell`/`frontx-template-mfe` would be exactly the
 * compile-time dependency CLI-1 exists to prevent, and `arch:check` fails on
 * it. `.gitignore` and CLI-1's own grep (`--exclude-dir=generated`) already
 * anticipated this mechanism — build-time generation into
 * `packages/cli/src/generated/` — before anything in the repo used it; this
 * script is the first thing that does.
 *
 * Discovery goes through `template-discovery.mjs`'s `findTemplateDirs`, the
 * ONE rule every repo-script that walks templates already shares (ADR-0018:
 * a template IS its manifest — a directory counts by carrying
 * `frontx-template.json`, never by matching a `template-*` name prefix).
 * A second copy of that rule here is how this generator and the CI guards
 * would come to disagree about what a template is.
 *
 * KNOWN LIMITATION, inherited rather than introduced: each origin is emitted
 * as a local `path:<dir>` form, resolvable against THIS checkout. That is the
 * only honest origin available today — these templates are not published
 * anywhere yet, and fabricating an address for a repository that does not
 * exist would be inventing product data. A published CLI therefore carries
 * defaults whose `path:` origins do not resolve in an unrelated project, and
 * `seed` is unusable outside this checkout for the same reason.
 *
 * This is a deferral rather than an open question, and the deferral is
 * recorded rather than asserted here: the root DECOMPOSITION's conversion
 * work item (`cpt-frontx-feature-template-territory-conversion`) carries it,
 * including the fact that finishing that conversion does not by itself make
 * `seed` usable elsewhere. Nothing here should be reshaped in anticipation of
 * the move; when it lands, this script emits origins naming wherever the
 * templates then live, and the ordinary resolver pins each at register time
 * exactly as it pins any other remote origin.
 *
 * What this script does fix is the CLI-1 violation: no template name is
 * authored into CLI source by hand any more.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = path.join(REPO_ROOT, 'packages', 'cli', 'src', 'generated', 'official-defaults.ts');

/**
 * Mirrors `MANIFEST_FILENAME` (`packages/cli/src/manifest/types.ts`) - kept as
 * a local literal rather than an import so this script keeps working straight
 * after `npm ci`, with no `build:packages:cli` prerequisite.
 */
export const MANIFEST_FILENAME = 'frontx-template.json';

/**
 * Every top-level directory at `rootDir` that carries `MANIFEST_FILENAME`,
 * sorted. A template IS its manifest (ADR-0018): a directory counts by
 * carrying the manifest, never by matching a `template-*` name prefix.
 *
 * This rule used to live in a shared `scripts/template-discovery.mjs` because
 * several CI guards walked template territory. Template territory no longer
 * lives in this repository (`cpt-frontx-adr-template-acquisition-and-location`)
 * and those guards went with it, leaving this generator as the rule's only
 * consumer - so the rule lives here rather than in a module with one caller.
 *
 * `node_modules` is the ONE exclusion (install-time output, never something
 * this repo's own tree defines). A dot-prefixed top-level directory is
 * deliberately NOT excluded: filtering it out would reintroduce exactly the
 * naming assumption manifest-presence discovery exists to drop.
 *
 * @param {string} rootDir
 * @param {string} [manifestFilename]
 * @returns {string[]} absolute paths, sorted
 */
export function findTemplateDirs(rootDir, manifestFilename = MANIFEST_FILENAME) {
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
    .map((entry) => path.join(rootDir, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, manifestFilename)))
    .sort();
}

/**
 * Reads each discovered template's manifest-declared `name` and maps it to a
 * local `path:` origin naming that template's own top-level directory.
 *
 * Keyed by the manifest's OWN `name` (never the directory name) because that
 * identity is what `register`/`apply`/`uniformApply` key every other lookup
 * in this feature by — a batch entry naming a template must resolve to the
 * same identity `list`/`register` would report for it once installed.
 *
 * @param {string} rootDir
 * @returns {Record<string, string>} manifest name -> `path:<dir>` origin
 */
export function discoverOfficialDefaults(rootDir) {
  /** @type {Record<string, string>} */
  const defaults = {};
  for (const templateDir of findTemplateDirs(rootDir, MANIFEST_FILENAME)) {
    const manifestPath = path.join(templateDir, MANIFEST_FILENAME);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (typeof manifest.name !== 'string' || manifest.name === '') {
      throw new Error(`[generate-cli-official-defaults] ${manifestPath} declares no usable "name".`);
    }
    defaults[manifest.name] = `path:${path.basename(templateDir)}`;
  }
  return defaults;
}

/**
 * The full TypeScript module text for a discovered defaults map. Pure so the
 * sync-guard test can compare it against what is on disk without writing.
 *
 * @param {Record<string, string>} defaults
 * @returns {string}
 */
export function renderModule(defaults) {
  const lines = Object.keys(defaults)
    .sort()
    .map((name) => `  ${JSON.stringify(name)}: ${JSON.stringify(defaults[name])},`);
  // An empty map renders as `{}` on one line rather than a brace pair around a
  // blank line, so the generated file needs no formatter pass to be lint-clean.
  const entries = lines.length === 0 ? '' : `\n${lines.join('\n')}\n`;
  return `// GENERATED FILE — DO NOT EDIT.
// Written by \`scripts/generate-cli-official-defaults.mjs\` from the template
// territory discovered in this checkout by manifest presence (ADR-0018).
// Regenerate with \`npm run generate:cli-official-defaults\`; that script's own
// header explains why this list is generated rather than hand-authored
// (\`cpt-frontx-constraint-cli-template-independence\` forbids a hardcoded
// template package name in \`packages/cli/src\`, and CLI-1's own check
// excludes this directory for exactly that reason).
//
// Keyed by each template's manifest-declared \`name\`; each value is a local
// \`path:\` origin naming that template's own top-level directory in this
// checkout. The map is EMPTY whenever this repository carries no template
// territory of its own — the state \`cpt-frontx-adr-template-acquisition-and-location\`
// establishes — and \`seed\`, which accepts official defaults and nothing else,
// is correspondingly unusable until a default origin exists to generate from.

export const OFFICIAL_DEFAULT_TEMPLATES: Readonly<Record<string, string>> = {${entries}};
`;
}

function main() {
  const defaults = discoverOfficialDefaults(REPO_ROOT);
  const names = Object.keys(defaults);
  if (names.length === 0) {
    // An empty map is the EXPECTED state here, not a discovery failure:
    // template territory is not a top-level directory of this repository
    // (`cpt-frontx-adr-template-acquisition-and-location`), so there is
    // nothing to discover and nothing honest to name. The consequence is
    // stated rather than hidden - a CLI built from this checkout reports an
    // empty `defaults` set, and `seed`, which accepts official defaults and
    // nothing else, is unusable until a default origin exists to generate
    // from (`packages/cli/architecture/DESIGN.md`). Failing instead would
    // make this script permanently red for a state the design declares normal.
    console.warn(
      `[generate-cli-official-defaults] no template found under ${REPO_ROOT} ` +
        `(looked for a top-level directory carrying ${MANIFEST_FILENAME}); ` +
        `emitting an empty defaults map.`,
    );
  }
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const rendered = renderModule(defaults);
  const existing = fs.existsSync(OUTPUT_PATH) ? fs.readFileSync(OUTPUT_PATH, 'utf8') : null;
  if (existing === rendered) {
    console.log(`[generate-cli-official-defaults] up to date (${names.length} default(s)).`);
    return;
  }
  fs.writeFileSync(OUTPUT_PATH, rendered);
  console.log(`[generate-cli-official-defaults] wrote ${names.length} default(s) to ${path.relative(REPO_ROOT, OUTPUT_PATH)}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
