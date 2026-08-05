// @cpt-algo:cpt-frontx-algo-template-manifest-validate-contract:p1
import { readBundleFiles } from '../bundle/envelope';
import { isSafeRelativePath } from '../paths/relative-path';
import { MANIFEST_FILENAME } from './types';
import type { ManifestViolation, ManifestValidationResult, TemplateManifest } from './types';

// Result type for manifest parsing + validation in one step.
export type ReadManifestResult =
  | { ok: true; manifest: TemplateManifest }
  | { ok: false; message: string };

// The resolver seam (`FetchFn`, `packages/cli/src/resolver/types.ts`) may
// hand back either a bare manifest string (legacy single-file content) or a
// multi-file bundle envelope — the same envelope `FsContentStore` (adapters
// layer) already materializes to real on-disk files
// (`cpt-frontx-dod-template-resolution-install-by-spec`). Every caller of
// `readManifestFromContent` (composition resolution, uniform-apply,
// materialize) reads `InventoryEntry.content` — the exact string the
// resolver/inventory stored — so this single read path unwraps the bundle
// envelope down to its manifest file BEFORE validating/parsing, keeping
// every downstream caller's contract ("content is the manifest") unchanged
// whether the underlying fetch was single-file or multi-file. The envelope
// shape itself is owned by `bundle/envelope.ts`, a core module: `manifest/`
// stays free of any dependency on the IO `adapters/` layer without carrying
// its own copy of the parse.
function unwrapBundleEnvelope(content: string): string {
  const files = readBundleFiles(content);
  if (files === undefined) return content;
  const manifestText = files[MANIFEST_FILENAME];
  return typeof manifestText === 'string' ? manifestText : content;
}

// Parse and validate manifest content in one step, returning the typed manifest.
// This is the single read path — the same authoritative shape consumed at
// install, apply, and assembly time (cpt-frontx-dod-template-manifest-single-description).
export function readManifestFromContent(content: string): ReadManifestResult {
  const manifestText = unwrapBundleEnvelope(content);
  const validation = validateManifestContract(manifestText);
  if (validation.status === 'REJECTED') {
    return {
      ok: false,
      message: validation.violations.map((v) => v.message).join('; '),
    };
  }
  return { ok: true, manifest: JSON.parse(manifestText) as TemplateManifest };
}

// A well-formed repository-relative path: a non-empty string that is not
// absolute and does not escape the repository root via a `..` segment.
function isWellFormedRepoRelativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false;
  if (value.startsWith('/')) return false;
  return !value.split(/[\\/]/).includes('..');
}

// Environment-owned names no template may declare as ownership ground, at the
// root or nested at any depth: version-control metadata and platform droppings.
//
// This is the SAME closed set the seed flow treats as carrying no content when
// it inspects a target directory (`NON_CONTENT_ENTRIES` in
// `commands/seed-repository.ts`, which imports this constant rather than
// restating it). The exemption and this prohibition are two halves of one rule:
// a template allowed to declare `.git/` could claim ground the seed guard has
// already waved through as empty, and materialization would then write into the
// developer's own repository metadata — reintroducing, through the exemption,
// exactly the loss the guard exists to prevent.
export const RESERVED_ENVIRONMENT_ENTRIES: readonly string[] = ['.git', '.DS_Store', 'Thumbs.db'];

// Whether a declared path names, or nests under, a reserved environment-owned
// entry. Checked per segment so `.git`, `.git/hooks/`, and `packages/.git` are
// all refused: a template claiming any of them claims the same ground.
function isReservedEnvironmentPath(pathValue: string): boolean {
  return pathValue
    .replace(/\\/g, '/')
    .split('/')
    .some((segment) => RESERVED_ENVIRONMENT_ENTRIES.includes(segment));
}

// Reserved CLI-owned `.frontx/` namespace: `.frontx/provenance.json` and any
// other `.frontx/` path are reserved and NOT template-declarable, EXCEPT a
// template's own `.frontx/ai/<template-identity>/` bundle subtree, which is
// declarable ownership ground for that template (FEATURE §1.2, ADR-0027).
function isReservedFrontxPath(pathValue: string, templateIdentity: string): boolean {
  const normalized = pathValue.replace(/\\/g, '/').replace(/\/+$/, '');
  if (normalized !== '.frontx' && !normalized.startsWith('.frontx/')) return false;
  const ownBundleSubtree = `.frontx/ai/${templateIdentity}`;
  if (normalized === ownBundleSubtree || normalized.startsWith(`${ownBundleSubtree}/`)) return false;
  return true;
}

// @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-read-manifest
// The raw manifest string is passed in by the caller (command layer reads the file).
// This function is pure: no filesystem access, fully testable.
export function validateManifestContract(raw: string): ManifestValidationResult {
// @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-read-manifest
  const violations: ManifestViolation[] = [];

  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-parse-manifest
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-parse-error
    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-parse-violation
    violations.push({ field: 'manifest', message: 'manifest is unparseable: invalid JSON' });
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-parse-violation
    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-return-parse-rejected
    return { status: 'REJECTED', violations };
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-return-parse-rejected
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-parse-error
  }
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-parse-manifest

  // Guard: must be a plain object after parsing
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    violations.push({ field: 'manifest', message: 'manifest must be a JSON object' });
    return { status: 'REJECTED', violations };
  }

  const obj = parsed as Record<string, unknown>;

  // The template's own identity, used to recognize its own declarable
  // `.frontx/ai/<template-identity>/` bundle subtree against the reserved
  // `.frontx/` namespace below. Read ahead of the identity check itself so
  // the reserved-namespace checks have a value even when identity is later
  // flagged as missing/malformed.
  const rawName = obj['name'];
  const templateIdentity = typeof rawName === 'string' ? rawName : '';

  // ── Category 1: identity ──────────────────────────────────────────────────
  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-identity
  const name = obj['name'];
  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-identity-missing
  if (typeof name !== 'string' || name.trim() === '') {
    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-identity-violation
    violations.push({ field: 'name', message: 'identity field "name" is required and must be a non-empty string' });
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-identity-violation
  } else if (!isSafeRelativePath(name)) {
    // The identity addresses the template's installed content path and its own
    // `.frontx/ai/<identity>/` bundle subtree, so pre-publish validation refuses
    // a value install would refuse. Without this the two gates disagree and a
    // template can pass validation yet never be installable.
    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-identity-violation
    violations.push({
      field: 'name',
      message:
        'identity field "name" must be usable as a repository-relative path: no leading "/", ' +
        'no backslash, no ":" or control character, and no empty, "." or ".." segment',
    });
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-identity-violation
  }
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-identity-missing
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-identity

  // ── Category 2: version (versioned shape) ─────────────────────────────────
  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-version
  const version = obj['version'];
  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-version-missing
  if (typeof version !== 'string' || version.trim() === '') {
    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-version-violation
    violations.push({ field: 'version', message: 'version field is required and must conform to the versioned shape (a non-empty string)' });
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-version-violation
  }
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-version-missing
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-version

  // ── Category 3: ownership boundaries ──────────────────────────────────────
  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-boundaries
  const boundaries = obj['ownershipBoundaries'];
  const boundariesIsObject =
    typeof boundaries === 'object' && boundaries !== null && !Array.isArray(boundaries);
  if (!boundariesIsObject) {
    violations.push({
      field: 'ownershipBoundaries',
      message: 'ownership-boundaries category is required (an object declaring exclusiveSubtrees and sharedFiles)',
    });
  }
  const boundariesObj = boundariesIsObject ? (boundaries as Record<string, unknown>) : {};
  const exclusiveSubtrees = Array.isArray(boundariesObj['exclusiveSubtrees'])
    ? (boundariesObj['exclusiveSubtrees'] as unknown[])
    : [];
  const sharedFiles = Array.isArray(boundariesObj['sharedFiles'])
    ? (boundariesObj['sharedFiles'] as unknown[])
    : [];
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-boundaries

  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-for-each-subtree
  for (let i = 0; i < exclusiveSubtrees.length; i++) {
    const subtree = exclusiveSubtrees[i];
    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-subtree-invalid
    if (!isWellFormedRepoRelativePath(subtree)) {
      // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-subtree-violation
      violations.push({
        field: `ownershipBoundaries.exclusiveSubtrees[${i}]`,
        message: 'exclusive subtree must be a well-formed repository-relative path',
      });
      // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-subtree-violation
    }
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-subtree-invalid
    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-subtree-reserved
    if (
      typeof subtree === 'string' &&
      (isReservedFrontxPath(subtree, templateIdentity) || isReservedEnvironmentPath(subtree))
    ) {
      // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-subtree-reserved-violation
      violations.push({
        field: `ownershipBoundaries.exclusiveSubtrees[${i}]`,
        message:
          'a reserved namespace is not template-declarable: under .frontx/ only .frontx/ai/<template-identity>/ may be claimed, ' +
          `and the environment-owned names (${RESERVED_ENVIRONMENT_ENTRIES.join(', ')}) may not be claimed at any depth`,
      });
      // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-subtree-reserved-violation
    }
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-subtree-reserved
  }
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-for-each-subtree

  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-for-each-shared-file
  for (let i = 0; i < sharedFiles.length; i++) {
    const entry = sharedFiles[i];
    const entryObj =
      typeof entry === 'object' && entry !== null && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : null;
    const path = entryObj?.['path'];
    const mergeStrategy = entryObj?.['mergeStrategy'];
    const ownedRegions = entryObj?.['ownedRegions'];
    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-shared-file-invalid
    if (
      entryObj === null ||
      typeof path !== 'string' || path.trim() === '' ||
      typeof mergeStrategy !== 'string' || mergeStrategy.trim() === '' ||
      !Array.isArray(ownedRegions)
    ) {
      // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-shared-file-violation
      violations.push({
        field: `ownershipBoundaries.sharedFiles[${i}]`,
        message: 'a shared-file entry must declare a path, a merge strategy, and the owned keys/regions',
      });
      // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-shared-file-violation
    }
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-shared-file-invalid

    const mergeStrategyIsWellFormedString = typeof mergeStrategy === 'string' && mergeStrategy.trim() !== '';

    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-merge-strategy-invalid
    if (mergeStrategyIsWellFormedString && mergeStrategy !== 'exclusive' && mergeStrategy !== 'region-union') {
      // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-merge-strategy-violation
      violations.push({
        field: `ownershipBoundaries.sharedFiles[${i}].mergeStrategy`,
        message: 'merge strategy must be one of the closed set "exclusive" or "region-union"',
      });
      // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-merge-strategy-violation
    }
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-merge-strategy-invalid

    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-region-keys-missing
    if (mergeStrategy === 'region-union' && (!Array.isArray(ownedRegions) || ownedRegions.length === 0)) {
      // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-region-keys-violation
      violations.push({
        field: `ownershipBoundaries.sharedFiles[${i}].ownedRegions`,
        message: 'a region-union shared-file entry must declare at least one owned region key',
      });
      // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-region-keys-violation
    }
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-region-keys-missing

    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-shared-file-reserved
    if (typeof path === 'string' && (isReservedFrontxPath(path, templateIdentity) || isReservedEnvironmentPath(path))) {
      // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-shared-file-reserved-violation
      violations.push({
        field: `ownershipBoundaries.sharedFiles[${i}].path`,
        message:
          'a reserved namespace is not template-declarable: the CLI-owned .frontx/ metadata namespace, ' +
          `or an environment-owned name (${RESERVED_ENVIRONMENT_ENTRIES.join(', ')}) at any depth`,
      });
      // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-shared-file-reserved-violation
    }
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-shared-file-reserved
  }
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-for-each-shared-file

  // ── Category 4: referenced templates ──────────────────────────────────────
  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-referenced
  const referenced = obj['referencedTemplates'];
  const referencedList =
    referenced === undefined ? [] : Array.isArray(referenced) ? (referenced as unknown[]) : null;
  if (referencedList === null) {
    violations.push({
      field: 'referencedTemplates',
      message: 'referenced-templates category must be an array when present',
    });
  }
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-referenced

  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-for-each-referenced
  for (let i = 0; i < (referencedList ?? []).length; i++) {
    const entry = (referencedList as unknown[])[i];
    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-referenced-entry
    const entryObj =
      typeof entry === 'object' && entry !== null && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : null;
    const ref = entryObj?.['ref'];
    const appliedAt = entryObj?.['appliedAt'];
    const refIsWellFormed = typeof ref === 'string' && ref.trim() !== '';
    const targetIsPresent = typeof appliedAt === 'string' && appliedAt.trim() !== '';
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-referenced-entry
    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-referenced-invalid
    if (entryObj === null || !refIsWellFormed || !targetIsPresent) {
      // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-referenced-violation
      violations.push({
        field: `referencedTemplates[${i}]`,
        message: 'a referenced-template entry must declare a well-formed reference and a target location it is applied at',
      });
      // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-referenced-violation
    }
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-referenced-invalid
  }
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-for-each-referenced

  // ── Category 5: description ───────────────────────────────────────────────
  // Presence-and-shape only. Whether the prose actually describes the template
  // is what selection depends on and what no structural check can establish,
  // so validation never judges it.
  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-description
  const description = obj['description'];
  const descriptionIsDeclared = description !== undefined;
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-check-description

  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-description-invalid
  if (descriptionIsDeclared && (typeof description !== 'string' || description.trim() === '')) {
    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-description-violation
    violations.push({
      field: 'description',
      message:
        'a declared description must be a non-empty string: a description declared empty states nothing, ' +
        'whereas omitting the category is permitted and costs the template only its selectability from a stated intent',
    });
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-add-description-violation
  }
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-description-invalid

  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-violations
  if (violations.length > 0) {
    // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-return-rejected
    return { status: 'REJECTED', violations };
    // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-return-rejected
  }
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-violations

  // @cpt-begin:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-return-validated
  return { status: 'VALIDATED', violations: [] };
  // @cpt-end:cpt-frontx-algo-template-manifest-validate-contract:p1:inst-return-validated
}
