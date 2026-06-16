/**
 * Build-time version injection for @gears-frontx/cli.
 *
 * Reads all packages/[*]/package.json in the monorepo, extracts name + version,
 * and writes src/generated/versions.ts so generators ship with locked versions
 * matching the CLI's publication channel.
 *
 * ADR: cpt-frontx-adr-channel-aware-version-locking
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const PACKAGES_DIR = join(ROOT, 'packages');
const OUT_DIR = join(ROOT, 'packages', 'cli', 'src', 'generated');
const OUT_FILE = join(OUT_DIR, 'versions.ts');

interface PackageJson {
  name: string;
  version: string;
  private?: boolean;
}

function readPackageJson(dir: string): PackageJson | null {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return null;
  return JSON.parse(readFileSync(pkgPath, 'utf8'));
}

const entries: Array<[string, string]> = [];
let cliVersion = '0.0.0';

for (const name of readdirSync(PACKAGES_DIR)) {
  const dir = join(PACKAGES_DIR, name);
  const pkg = readPackageJson(dir);
  if (!pkg?.name) continue;
  entries.push([pkg.name, pkg.version]);
  if (pkg.name === '@gears-frontx/cli') {
    cliVersion = pkg.version;
  }
}

entries.sort(([a], [b]) => a.localeCompare(b));

if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true });
}

const lines = [
  '// AUTO-GENERATED — do not edit. Run `npm run generate-versions` to update.',
  '// @cpt-begin cpt-frontx-adr-channel-aware-version-locking',
  'export const PACKAGE_VERSIONS: Record<string, string> = {',
  ...entries.map(([name, version]) => `  '${name}': '${version}',`),
  '};',
  '',
  `export const CLI_VERSION = '${cliVersion}';`,
  '// @cpt-end cpt-frontx-adr-channel-aware-version-locking',
  '',
];

writeFileSync(OUT_FILE, lines.join('\n'));
console.log(`Generated ${OUT_FILE} with ${entries.length} packages (CLI v${cliVersion})`);
