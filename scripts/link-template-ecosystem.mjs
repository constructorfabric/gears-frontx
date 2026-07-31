/**
 * In-monorepo dev loop for the shell template.
 *
 * `template-shell/` is not a root workspace: it is a standalone npm project
 * that pins `@gears-frontx/api`, `@gears-frontx/mfes` and
 * `@gears-frontx/gts-plugin` to exact registry versions so a seeded project can
 * install outside the monorepo. The cost of that pin is that a plain
 * `npm install` inside the template resolves the *published* alpha, so edits to
 * `packages/*` never reach the template and the failure is silent — the
 * template builds, type-checks and tests green against code nobody changed.
 *
 * This script repoints the three installed ecosystem directories at the local
 * sources. It replaces exactly those three entries and touches nothing else:
 * not `package.json`, not `package-lock.json`, not the rest of the tree.
 *
 * A `npm install --no-save --no-package-lock <paths>` would do the linking too,
 * but npm rebuilds the whole ideal tree for it — pruning unrelated packages and
 * replacing the template's `file:.` self-link with a packed snapshot of
 * `dist-lib`, which breaks the template's own rebuild-on-change loop.
 *
 * Run `npm ci` inside `template-shell` to go back to the pinned versions.
 *
 * CLI entry: `npm run dev:template:link` (exit 0 on success).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scopeDir = path.join(repoRoot, 'template-shell', 'node_modules', '@gears-frontx');

// Only the packages the template pins to the registry. The rest of
// `@gears-frontx/*` inside the template either lives in its own subtree or is
// already linked by npm, and must keep whatever npm gave it.
const linkedPackages = ['api', 'mfes', 'gts-plugin'];

if (!fs.existsSync(scopeDir)) {
  console.error(
    `Cannot link: ${path.relative(repoRoot, scopeDir)} does not exist.\n` +
      'Run `npm ci` inside template-shell first.',
  );
  process.exit(1);
}

for (const name of linkedPackages) {
  const source = path.join(repoRoot, 'packages', name);
  if (!fs.existsSync(path.join(source, 'package.json'))) {
    console.error(`Cannot link: packages/${name} is missing.`);
    process.exit(1);
  }

  const target = path.join(scopeDir, name);
  fs.rmSync(target, { recursive: true, force: true });
  // Relative link so the tree stays valid if the checkout moves.
  fs.symlinkSync(path.relative(scopeDir, source), target, 'dir');
  console.log(`linked @gears-frontx/${name} -> packages/${name}`);
}

console.log('Run `npm run build:packages` first if the local dist/ is stale.');
