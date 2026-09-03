// Real fs-backed seams for `../scaffold/existing-content.ts`
// (`cpt-frontx-algo-cli-scaffolding-existing-content`) — the two content
// readers that algorithm's pure logic depends on, matching every other
// adapter in this package's convention of one real adapter per injected
// seam type, kept in its own file since this concern (reading real file
// CONTENT, not just enumerating paths) is new: `adapters/fs-project-io.ts`'s
// `createFsListTargetFilesFn` and `adapters/fs-read-content-items.ts`'s
// `createFsReadContentItemsFn` each enumerate paths for a DIFFERENT
// existing purpose, neither returning the `{path, content}` pairs
// reconciliation needs to compare on-disk bytes against a template's
// payload.
//
// Deliberately simple, matching `adapters/fs-read-content-items.ts`'s own
// scope: a plain recursive `readdir`/`readFile` walk, no symlink-cycle
// handling. `readInstalledContent`'s installed-content-path enumeration
// mirrors that adapter's own walk exactly (a template's installed content is
// never a symlink farm); `readExistingContent`'s target-directory walk
// intentionally applies NO skip list (no `node_modules` exclusion) for the
// identical reason `adapters/fs-project-io.ts`'s `createFsListTargetFilesFn`
// already gives for the delete-plan algorithm's own real-file enumeration:
// the six-term effective-ownership subtraction these seams feed
// (`scaffold/effective-ownership.ts`) names no such exclusion, and adding
// one here would silently add a seventh, undeclared term to that one
// shared formula.
import fs from 'node:fs';
import path from 'node:path';
import type { ContentItem } from '../scaffold/types';
import type { ReadInstalledContentFn, ReadExistingContentFn } from '../scaffold/existing-content';

// Install-time output, never committed template content
// (`cpt-frontx-algo-template-manifest-validate-content-self-containment`'s own
// `inst-csc-enumerate-files`, which enumerates a payload "never descending into
// a `node_modules` directory").
const PAYLOAD_SKIP_DIR = 'node_modules';

// `skipInstallOutput` distinguishes the two callers below, and the distinction
// is load-bearing rather than cosmetic:
//
//   - Reading a TEMPLATE's payload (`createFsReadInstalledContentFn`) must skip
//     `node_modules`, because the payload definition itself excludes it. This
//     repository's own `template-shell` is 428 MB across 32,813 files of which
//     529 are payload; reading all of it made `apply` copy install output into
//     the target, and made the resolver's own local-origin read exceed V8's
//     maximum string length when it encoded the folder as one bundle envelope.
//   - Walking a project TARGET (`createFsReadExistingContentFn`) must NOT skip
//     it: the six-term effective-ownership subtraction
//     (`../scaffold/effective-ownership.ts`) names no `node_modules` exclusion
//     for ground a template owns, and adding one would silently introduce an
//     undeclared seventh term — the exact reason
//     `createFsListTargetFilesFn`'s own comment gives for ITS empty skip set.
//
// One walk, one parameter, so the two rules cannot drift apart in two copies.
function listFilesRecursive(root: string, skipInstallOutput: boolean, relativeDir = ''): ContentItem[] {
  const absoluteDir = path.join(root, relativeDir);
  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
  const items: ContentItem[] = [];
  for (const entry of entries) {
    const relativePath = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (skipInstallOutput && entry.name === PAYLOAD_SKIP_DIR) continue;
      items.push(...listFilesRecursive(root, skipInstallOutput, relativePath));
    } else if (entry.isFile()) {
      items.push({ path: relativePath, content: fs.readFileSync(path.join(root, relativePath), 'utf-8') });
    }
    // A symlink or other special entry is neither a directory nor a file by
    // `withFileTypes`'s own report; skipped rather than resolved, matching
    // `fs-read-content-items.ts`'s identical scope for the identical reason
    // (a template's installed content, and an applied target, are not
    // expected to be symlink farms).
  }
  return items;
}

/**
 * Real `ReadInstalledContentFn` — every real file reachable under a
 * template's installed content path, template-relative. `installedContentPath`
 * is either an ABSOLUTE local-inventory path or a PROJECT-RELATIVE local
 * `path:` origin folder (`scaffold/assembler.ts`'s own `ResolvedTemplate`
 * doc comment on this asymmetry, pre-existing and not this adapter's to
 * resolve) — both are handled by joining against `repoRoot` only when the
 * given path is not already absolute, `path.join` leaving an absolute path
 * untouched.
 */
export function createFsReadInstalledContentFn(repoRoot: string): ReadInstalledContentFn {
  return async function readInstalledContent(installedContentPath: string): Promise<ContentItem[]> {
    const absolute = path.isAbsolute(installedContentPath) ? installedContentPath : path.join(repoRoot, installedContentPath);
    if (!fs.existsSync(absolute)) return [];
    // A TEMPLATE's payload: install output is not content.
    return listFilesRecursive(absolute, true);
  };
}

/**
 * Real `ReadExistingContentFn` — every real file already on disk under a
 * project-relative `target` (which may legitimately be `.`, the project
 * root), project-relative. Resolves to `[]`, never a throw, when nothing
 * exists at `target` yet — the ordinary case for a fresh target
 * materialization is about to create.
 */
export function createFsReadExistingContentFn(repoRoot: string): ReadExistingContentFn {
  return async function readExistingContent(target: string): Promise<ContentItem[]> {
    const absolute = path.join(repoRoot, target);
    if (!fs.existsSync(absolute)) return [];
    // `target` itself is the walk's root, so items come back template-root-
    // relative already; re-root them under `target` here (never `.`, the
    // spelling `path.join('.', 'x')` avoids anyway) so a caller comparing
    // against a payload's own project-relative path set — which never
    // spells the "." prefix either (`existing-content.ts`'s own
    // `toProjectRelativePath`) — compares like for like.
    // A project TARGET: no skip list, per the six-term subtraction.
    const items = listFilesRecursive(absolute, false);
    if (target === '.') return items;
    return items.map((item) => ({ ...item, path: `${target}/${item.path}` }));
  };
}
