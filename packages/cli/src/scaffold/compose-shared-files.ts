import type { OwnershipBoundary } from '../manifest/types';
import type { ProvenanceRecord } from '../provenance/types';
import type { ReadProjectFileFn, StagedAssembly, WriteFileFn } from './types';

// Region-addressing schema owned by `cpt-frontx-feature-template-manifest`: a
// `region-union` shared-file entry's owned region is delimited on disk by a
// matched begin/end sentinel-marker pair embedding the owning template's
// identity and the region key — a comment-style marker line pair of the
// shape `frontx:region <identity>:<key>` … `frontx:endregion <identity>:<key>`.
const REGION_BEGIN_PREFIX = 'frontx:region';
const REGION_END_PREFIX = 'frontx:endregion';

// A single template's declared claim on one target repository file path,
// carrying the identity, declared merge strategy, and owned region keys
// needed to resolve write ownership. `mergeStrategy` mirrors
// `SharedFileEntry.mergeStrategy` (a closed set already validated upstream by
// the manifest contract) — kept as `string` here rather than narrowed via a
// cast.
interface PathContribution {
  templateName: string;
  mergeStrategy: string;
  ownedRegions: string[];
  content: string;
}

// One contributing template's extracted region-union content for a shared
// path — the sentinel markers are preserved in `markerBlock` so a later
// boundary-scoped upgrade, and the pt.2 disjoint-union composition (out of
// scope here), can re-locate it.
export interface ExtractedRegion {
  templateName: string;
  regionKey: string;
  markerBlock: string;
}

// A single repository file materialized by the algorithm — either a
// whole-file single-owner write or the composed disjoint-region union.
export interface MaterializedFile {
  path: string;
  content: string;
}

// The algorithm's outcome: the full set of materialized repository files
// (`inst-cs-return-materialized`), or one of several refusals. Three are
// declared-level or carried-key materialization invariants (each names a
// condition the pre-flight conflict check,
// `cpt-frontx-algo-cli-scaffolding-conflict-check`, should already have
// refused, so reaching any of them here is a bug in that earlier gate rather
// than a normal refusal path); `span-overlap` is the content-level conflict
// only materialization can observe; `unrecorded-owner` is neither a bug nor
// a content-level conflict — it is evidence the occupied-boundary picture
// the pre-flight check evaluated was incomplete (`inst-cs-return-unrecorded-owner`).
// `carried-block-conflict` is likewise not a pre-flight-check miss: it is
// detected entirely WITHIN the carried-block set read from one on-disk
// buffer, which the pre-flight check never sees at all, so a duplicate or
// overlapping pair there can only mean the on-disk file itself — the same
// insufficiently-trusted source `unrecorded-owner` already treats with
// suspicion — was hand-edited or corrupted since it was last written
// (`inst-cs-return-carried-block-conflict`).
export type ComposeSharedFilesResult =
  | { ok: true; files: MaterializedFile[] }
  | { ok: false; reason: 'exclusive-contested'; path: string; contestants: string[]; message: string }
  | { ok: false; reason: 'key-collision'; path: string; regionKey: string; contestants: string[]; message: string }
  | {
      ok: false;
      reason: 'span-overlap';
      path: string;
      contestants: string[];
      regionKeys: string[];
      message: string;
    }
  | {
      ok: false;
      reason: 'unrecorded-owner';
      path: string;
      templateIdentity: string;
      regionKey: string;
      message: string;
    }
  | {
      ok: false;
      reason: 'carried-key-collision';
      path: string;
      regionKey: string;
      contestants: string[];
      message: string;
    }
  | {
      ok: false;
      reason: 'carried-block-conflict';
      path: string;
      contestants: string[];
      regionKeys: string[];
      message: string;
    };

// Resolves a single content item's declared ownership on its own path — a
// whole-file `exclusive` claim when no shared-file entry declares the path
// (it is written whole by its template because it falls under a declared
// exclusive subtree), or the declared merge strategy + owned region keys
// when a shared-file entry declares it.
function resolvePathContribution(
  templateName: string,
  path: string,
  content: string,
  boundaries: OwnershipBoundary,
): PathContribution {
  const sharedEntry = boundaries.sharedFiles.find((entry) => entry.path === path);
  if (!sharedEntry) {
    return { templateName, mergeStrategy: 'exclusive', ownedRegions: [], content };
  }
  return { templateName, mergeStrategy: sharedEntry.mergeStrategy, ownedRegions: sharedEntry.ownedRegions, content };
}

// @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-group-by-path
/**
 * Groups the staged assembly's contributions by target repository file path,
 * carrying each contributing template's identity, declared merge strategy,
 * and owned region keys.
 */
export function groupContributionsByPath(assembly: StagedAssembly): Map<string, PathContribution[]> {
  const grouped = new Map<string, PathContribution[]>();
  for (const contribution of assembly.contributions) {
    for (const file of contribution.files) {
      const entry = resolvePathContribution(
        contribution.templateName,
        file.path,
        file.content,
        contribution.ownershipBoundaries,
      );
      const existing = grouped.get(file.path);
      if (existing) {
        existing.push(entry);
      } else {
        grouped.set(file.path, [entry]);
      }
    }
  }
  return grouped;
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-group-by-path

// The actual on-disk line-index span of one located marker pair — the
// content-level position that pt.2's span-overlap check (inst-cs-if-span-overlap)
// compares across regions; a declared region key alone (checked by pt.1's
// inst-cs-if-key-collision) cannot reveal this.
export interface RegionSpan {
  beginIndex: number;
  endIndex: number;
}

// Locates one template's owned region on disk by matching the begin/end
// sentinel-marker pair keyed by that template's identity and the declared
// region key. Returns undefined if the pair cannot be located — pre-publish
// manifest validation guarantees well-formed declared keys, not that the
// markers exist on disk.
export function locateRegionSpan(content: string, templateName: string, regionKey: string): RegionSpan | undefined {
  const lines = content.split('\n');
  const beginMarker = `${REGION_BEGIN_PREFIX} ${templateName}:${regionKey}`;
  const endMarker = `${REGION_END_PREFIX} ${templateName}:${regionKey}`;
  const beginIndex = lines.findIndex((line) => line.includes(beginMarker));
  if (beginIndex === -1) return undefined;
  const endIndex = lines.findIndex((line, index) => index > beginIndex && line.includes(endMarker));
  if (endIndex === -1) return undefined;
  return { beginIndex, endIndex };
}

// Locates and extracts one template's owned region from its installed
// content by matching the begin/end sentinel-marker pair keyed by that
// template's identity and the declared region key. Returns the region text
// INCLUSIVE of its marker lines, undefined if the pair cannot be located.
export function extractOwnedRegion(content: string, templateName: string, regionKey: string): string | undefined {
  const span = locateRegionSpan(content, templateName, regionKey);
  if (!span) return undefined;
  const lines = content.split('\n');
  return lines.slice(span.beginIndex, span.endIndex + 1).join('\n');
}

// A block discovered by scanning a file for ANY begin/end sentinel-marker
// pair, without prior knowledge of the owning identity or region key — the
// reverse of `locateRegionSpan`/`extractOwnedRegion` above, which locate one
// ALREADY-KNOWN (identity, key) pair. `inst-cs-read-existing-blocks` needs
// this to discover a block whose owner may not be a contributor to the
// staged assembly at all: a template applied by an earlier `add` that this
// assembly does not touch.
export interface LocatedBlock {
  identity: string;
  regionKey: string;
  span: RegionSpan;
  text: string; // verbatim, INCLUSIVE of marker lines — carried forward as-is, never re-derived
}

// @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-read-existing-blocks
/**
 * Scans a file's content for every begin/end sentinel-marker pair and
 * returns each located block's owning identity, region key, and verbatim
 * text. Applies the region-addressing schema owned by
 * `cpt-frontx-feature-template-manifest` in reverse: the forward matcher
 * (`locateRegionSpan`) already tolerates an arbitrary comment PREFIX before
 * the marker token via loose `line.includes(...)` matching, because the
 * marker is meant to hide inside a comment of any language. Scanning without
 * a known (identity, key) to match against additionally needs a SUFFIX
 * boundary — the manifest contract places no charset restriction on a
 * region key, so `identity:key` cannot be split from a trailing
 * comment-closer (e.g. an HTML comment's or a block comment's closing
 * token) by any rule guaranteed correct in general. Every existing manifest
 * and test fixture writes `identity:key` as
 * one whitespace-free token, so this scanner takes the marker token up to
 * the first whitespace as the boundary it CAN resolve, then splits that
 * token on the FIRST `:` — a template identity is a colon-free
 * package-style name, so the region key is whatever remains, colons
 * included. A marker whose key carries embedded whitespace, or whose
 * comment-closer touches the token with no separating space, falls outside
 * what this scanner can resolve — flagged as an open ambiguity rather than
 * silently constrained (see PR discussion), since the manifest contract does
 * not close it.
 */
export function locateAllMarkerBlocks(content: string): LocatedBlock[] {
  const lines = content.split('\n');
  const begins: Array<{ lineIndex: number; identity: string; regionKey: string }> = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const prefixIndex = lines[lineIndex].indexOf(REGION_BEGIN_PREFIX);
    if (prefixIndex === -1) continue;
    const afterPrefix = lines[lineIndex].slice(prefixIndex + REGION_BEGIN_PREFIX.length).trimStart();
    const token = afterPrefix.split(/\s/)[0] ?? '';
    const colonIndex = token.indexOf(':');
    if (colonIndex === -1) continue; // malformed marker — no identity:key separator; not a locatable block
    begins.push({ lineIndex, identity: token.slice(0, colonIndex), regionKey: token.slice(colonIndex + 1) });
  }

  const blocks: LocatedBlock[] = [];
  for (const begin of begins) {
    const endMarker = `${REGION_END_PREFIX} ${begin.identity}:${begin.regionKey}`;
    const endIndex = lines.findIndex((line, index) => index > begin.lineIndex && line.includes(endMarker));
    if (endIndex === -1) continue; // unterminated — no matching end marker to close the span
    blocks.push({
      identity: begin.identity,
      regionKey: begin.regionKey,
      span: { beginIndex: begin.lineIndex, endIndex },
      text: lines.slice(begin.lineIndex, endIndex + 1).join('\n'),
    });
  }
  return blocks;
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-read-existing-blocks

// @cpt-algo:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1
// @cpt-dod:cpt-frontx-dod-cli-scaffolding-preserve-applied-regions:p1
/**
 * Groups the conflict-cleared staged assembly's contributions by target
 * repository file path and computes the whole-file single-owner paths'
 * content; for every path with any `region-union` contribution, guards the
 * declared-level materialization invariants (a contested `exclusive` path,
 * two contributors resolving the same declared region key, or a
 * carried-forward block colliding with a freshly-extracted region) that the
 * pre-flight conflict check (`cpt-frontx-algo-cli-scaffolding-conflict-check`)
 * should already have refused; reads any file already on disk at the path
 * and refuses the whole assembly when it carries a marker block whose owning
 * identity this assembly does not contribute AND the target's existing
 * provenance does not record (`inst-cs-if-unrecorded-block-owner`) — the
 * occupied-boundary picture the pre-flight check evaluated was incomplete —
 * otherwise carrying every other on-disk block forward verbatim
 * (`inst-cs-carry-forward-recorded-blocks`, the issue #487 fix: an earlier
 * `add` no longer truncates a previously-applied template's already-written
 * region-union block); refuses the assembly, before trusting that carried
 * set any further, when two CARRIED blocks resolve the same (identity,
 * regionKey) pair or have overlapping/nested spans — a corrupted or
 * hand-edited target file, not a pre-flight-check miss, since the pre-flight
 * check never sees carried blocks at all (`inst-cs-if-carried-block-conflict`);
 * extracts each contributor's owned region by its
 * identity-and-region-key sentinel markers; refuses the assembly if any two
 * EXTRACTED regions' actual on-disk marker spans overlap — the
 * content-level check only materialization can observe; composes the
 * collision-free set (extracted regions plus carried-forward blocks) as a
 * deterministic disjoint union with markers preserved. Only once every path
 * has been processed with no refusal does this function write any file
 * (`inst-cs-write-materialized`), so a refusal reached while processing any
 * path leaves the target repository untouched — ADR-0032's "a refused
 * assembly writes zero files", which writing each path inline as it was
 * computed would have violated the moment a LATER path's span-overlap
 * refusal fired. Returns every materialized repository file.
 */
export async function composeSharedFiles(
  assembly: StagedAssembly,
  targetDir: string,
  writeFileFn: WriteFileFn,
  // Both default to "nothing already on disk, nothing already applied" —
  // exactly the previous behavior — for the few call sites that genuinely
  // have no target repository to reconcile against (e.g. a fresh in-memory
  // fixture). Every real seed/add path (`seedRepository`, `addTemplate`,
  // `scaffoldComposedProject`) always supplies its own real values.
  readProjectFileFn: ReadProjectFileFn = async () => null,
  existingProvenance: ProvenanceRecord[] = [],
): Promise<ComposeSharedFilesResult> {
  const grouped = groupContributionsByPath(assembly);
  const materializedFiles: MaterializedFile[] = [];
  // Identities of templates already applied to the target repository, per
  // its existing provenance records — empty for a seed. Used ONLY to tell a
  // recorded-but-not-contributing owner apart from an unrecorded one
  // (inst-cs-if-unrecorded-block-owner / inst-cs-carry-forward-recorded-blocks);
  // never resolved to an installed template's own ownership boundary here,
  // because a carried block is written back verbatim from disk — never
  // re-derived from any template's installed content.
  const appliedIdentities = new Set(existingProvenance.map((record) => record.templateIdentity));

  for (const [path, entries] of grouped) {
    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-foreach-single
    // A target file path owned whole by exactly one template — an exclusive
    // subtree or a whole-file `exclusive` claim (both resolve to
    // mergeStrategy 'exclusive' above).
    if (entries.length === 1 && entries[0].mergeStrategy === 'exclusive') {
      // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-write-single
      // Computed only — the actual write is deferred to
      // inst-cs-write-materialized below, so a refusal raised while
      // processing a LATER path cannot leave THIS path already written.
      materializedFiles.push({ path, content: entries[0].content });
      // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-write-single
      continue;
    }
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-foreach-single

    const hasRegionUnionContribution = entries.some((entry) => entry.mergeStrategy === 'region-union');
    // A contested exclusive-only path (no region-union contributor at all)
    // is out of this algorithm's scope — the pre-flight conflict check's
    // exclusive-clash rule already prevents it from reaching materialization.
    if (!hasRegionUnionContribution) continue;

    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-foreach-multi
    // Any target file path with a region-union contribution — one
    // contributor or many.
    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-if-exclusive-contested
    const exclusiveContested = entries.length > 1 && entries.some((entry) => entry.mergeStrategy === 'exclusive');
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-if-exclusive-contested
    if (exclusiveContested) {
      // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-return-exclusive-invariant
      return {
        ok: false,
        reason: 'exclusive-contested',
        path,
        contestants: entries.map((entry) => entry.templateName),
        message:
          `Materialization invariant violated — path "${path}" has a contested exclusive claim; ` +
          'the pre-flight conflict check should have refused this assembly before any file was written.',
      };
      // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-return-exclusive-invariant
    }

    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-read-existing-blocks
    // The file already on disk at this path, if any — the ONLY source for a
    // block owned by a template this assembly does not contribute. Composing
    // without ever consulting it is exactly what issue #487 pinned as a
    // defect: a `region-union` file was rebuilt from the incoming assembly's
    // contribution alone, discarding whatever an earlier `add` had already
    // written there.
    const existingContent = await readProjectFileFn(`${targetDir}/${path}`);
    const existingBlocks = existingContent !== null ? locateAllMarkerBlocks(existingContent) : [];
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-read-existing-blocks

    const contributorIdentities = new Set(entries.map((entry) => entry.templateName));

    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-if-unrecorded-block-owner
    const unrecordedBlock = existingBlocks.find(
      (block) => !contributorIdentities.has(block.identity) && !appliedIdentities.has(block.identity),
    );
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-if-unrecorded-block-owner
    if (unrecordedBlock) {
      // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-return-unrecorded-owner
      return {
        ok: false,
        reason: 'unrecorded-owner',
        path,
        templateIdentity: unrecordedBlock.identity,
        regionKey: unrecordedBlock.regionKey,
        message:
          `Materialization refused — path "${path}" carries a block owned by "${unrecordedBlock.identity}" ` +
          `(region "${unrecordedBlock.regionKey}") that this assembly does not contribute and that this ` +
          "repository's existing provenance does not record. That on-disk block is NOT a declaration of " +
          'ownership — it is evidence that the occupied-boundary picture the pre-flight conflict check ' +
          'evaluated was incomplete: no arbitrated claim accounts for this ground, so composing over it would ' +
          "either drop the occupying template's contribution or silently absorb an un-arbitrated claim, and " +
          'assembly-conflict-prevention forbids both outcomes. No file is written. Record ' +
          `"${unrecordedBlock.identity}"'s applied provenance for this repository (for example, reinstall it and ` +
          'reapply it through "frontx add") and retry.',
      };
      // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-return-unrecorded-owner
    }

    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-carry-forward-recorded-blocks
    // Every located block reaching here is, by the check above, either a
    // contributor's own (stale) on-disk block — superseded by the fresh
    // extraction from its installed content just below — or owned by a
    // template recorded in provenance but NOT contributing to this
    // assembly: exactly the ground `cpt-frontx-flow-cli-scaffolding-add-template`
    // must leave untouched. Carried verbatim, never re-derived from
    // installed content, so `add` cannot silently upgrade a template outside
    // this assembly's own reviewable change-set.
    const carriedBlocks = existingBlocks.filter((block) => !contributorIdentities.has(block.identity));
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-carry-forward-recorded-blocks

    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-if-carried-block-conflict
    // `locateAllMarkerBlocks` is a raw scanner: it neither deduplicates
    // repeated (identity, regionKey) pairs nor rejects nested/overlapping
    // spans, so this is the first point that can catch a corrupted or
    // hand-edited target file BEFORE it is trusted the same way an
    // occupied-boundary comparison trusts a declared claim. Every carried
    // block was located in the SAME on-disk buffer (`inst-cs-read-existing-blocks`),
    // so — unlike the cross-buffer extracted-region check below, which only
    // compares spans when both buffers are byte-identical — comparing spans
    // within this set is unconditionally valid. Checked BEFORE building any
    // Map keyed by (identity, regionKey): a Map silently keeps the last
    // duplicate and would hide exactly the condition this check exists to
    // surface.
    let carriedBlockConflict: { kind: 'duplicate' | 'overlap'; first: LocatedBlock; second: LocatedBlock } | undefined;
    for (let i = 0; i < carriedBlocks.length && !carriedBlockConflict; i++) {
      for (let j = i + 1; j < carriedBlocks.length; j++) {
        const first = carriedBlocks[i];
        const second = carriedBlocks[j];
        if (first.identity === second.identity && first.regionKey === second.regionKey) {
          carriedBlockConflict = { kind: 'duplicate', first, second };
          break;
        }
        if (first.span.beginIndex <= second.span.endIndex && second.span.beginIndex <= first.span.endIndex) {
          carriedBlockConflict = { kind: 'overlap', first, second };
          break;
        }
      }
    }
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-if-carried-block-conflict
    if (carriedBlockConflict) {
      // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-return-carried-block-conflict
      const { kind, first, second } = carriedBlockConflict;
      const found =
        kind === 'duplicate'
          ? `two carried blocks both resolving identity "${first.identity}" and region key "${first.regionKey}"`
          : `two carried blocks with overlapping or nested on-disk marker spans ` +
            `(${first.identity}:${first.regionKey} and ${second.identity}:${second.regionKey})`;
      return {
        ok: false,
        reason: 'carried-block-conflict',
        path,
        contestants: [first.identity, second.identity],
        regionKeys: [first.regionKey, second.regionKey],
        message:
          `Materialization refused — the file already on disk at path "${path}" carries ${found}. This is not a ` +
          'pre-flight conflict-check miss: carried blocks are read directly from that file and are never compared ' +
          'against each other before materialization, so a duplicate or overlapping pair among them can only mean ' +
          'the file was edited by hand or otherwise corrupted since it was last written by this tool. Fix the file ' +
          `at "${path}" (remove the duplicate marker pair, or disentangle the overlapping regions) and retry. No ` +
          'file was written.',
      };
      // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-return-carried-block-conflict
    }

    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-extract-regions
    const extracted: ExtractedRegion[] = [];
    for (const entry of entries) {
      if (entry.mergeStrategy !== 'region-union') continue;
      for (const regionKey of entry.ownedRegions) {
        const markerBlock = extractOwnedRegion(entry.content, entry.templateName, regionKey);
        if (markerBlock === undefined) continue;
        extracted.push({ templateName: entry.templateName, regionKey, markerBlock });
      }
    }
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-extract-regions

    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-if-key-collision
    const ownersByRegionKey = new Map<string, string[]>();
    for (const region of extracted) {
      const owners = ownersByRegionKey.get(region.regionKey);
      if (owners) {
        owners.push(region.templateName);
      } else {
        ownersByRegionKey.set(region.regionKey, [region.templateName]);
      }
    }
    const collidedRegionKey = [...ownersByRegionKey.entries()].find(([, owners]) => owners.length > 1);
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-if-key-collision
    if (collidedRegionKey) {
      const [regionKey, owners] = collidedRegionKey;
      // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-return-key-invariant
      return {
        ok: false,
        reason: 'key-collision',
        path,
        regionKey,
        contestants: owners,
        message:
          `Materialization invariant violated — path "${path}" has two contributors resolving region key ` +
          `"${regionKey}" (${owners.join(', ')}); the pre-flight conflict check should have refused this assembly.`,
      };
      // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-return-key-invariant
    }

    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-if-carried-key-collision
    // Defensive, mirroring inst-cs-if-key-collision above: `carriedBlocks`
    // excludes every contributor identity by construction
    // (inst-cs-carry-forward-recorded-blocks), so a carried owner and a
    // contributor can never legitimately share (identity, key) — this
    // SHOULD be unreachable whenever the pre-flight conflict check's
    // occupied-boundary comparison ran correctly. Checked anyway: reaching
    // this collision instead of being stopped earlier by that comparison is
    // exactly the failure mode a materialization invariant exists to catch.
    // (A NUL-separated composite key, rather than a delimiter that could
    // itself appear inside an identity or a region key, keeps the lookup
    // unambiguous.)
    const carriedByIdentityKey = new Map(
      carriedBlocks.map((block) => [`${block.identity}\u0000${block.regionKey}`, block]),
    );
    const collidedCarried = extracted.find((region) =>
      carriedByIdentityKey.has(`${region.templateName}\u0000${region.regionKey}`),
    );
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-if-carried-key-collision
    if (collidedCarried) {
      // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-return-carried-key-invariant
      return {
        ok: false,
        reason: 'carried-key-collision',
        path,
        regionKey: collidedCarried.regionKey,
        contestants: [collidedCarried.templateName],
        message:
          `Materialization invariant violated — path "${path}" has a carried-forward block and a freshly ` +
          `extracted region both resolving identity "${collidedCarried.templateName}" and region key ` +
          `"${collidedCarried.regionKey}"; the pre-flight conflict check should have refused this assembly via ` +
          'the occupied-boundary comparison.',
      };
      // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-return-carried-key-invariant
    }

    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-if-span-overlap
    // Re-locates each extracted region's actual on-disk line-index span (not
    // carried by `ExtractedRegion` — pt.1 only needed the marker text) to
    // detect an overlap that neither manifest validation (well-formed keys
    // only) nor the pre-flight conflict check (declared keys only) can see.
    // A line-index span is only meaningful relative to the buffer it was
    // located in, so two regions are only compared when they were located in
    // the SAME on-disk buffer — trivially true for a single template's own
    // multiple keys (self-overlap), and true for two different templates only
    // when both ship byte-identical content for the shared path (the
    // canonical-shared-file convention `cpt-frontx-feature-template-manifest`
    // expects a region-union path to follow), which is what makes
    // cross-template overlap detectable at all.
    const contentByTemplate = new Map(entries.map((entry) => [entry.templateName, entry.content]));
    const spans = extracted.map((region) => {
      const content = contentByTemplate.get(region.templateName);
      const span = content ? locateRegionSpan(content, region.templateName, region.regionKey) : undefined;
      return { region, content, span };
    });
    let overlappingPair: [ExtractedRegion, ExtractedRegion] | undefined;
    for (let i = 0; i < spans.length && !overlappingPair; i++) {
      for (let j = i + 1; j < spans.length; j++) {
        const a = spans[i];
        const b = spans[j];
        if (!a.span || !b.span || a.content !== b.content) continue;
        if (a.span.beginIndex <= b.span.endIndex && b.span.beginIndex <= a.span.endIndex) {
          overlappingPair = [a.region, b.region];
          break;
        }
      }
    }
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-if-span-overlap
    if (overlappingPair) {
      // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-return-span-overlap
      const [regionA, regionB] = overlappingPair;
      return {
        ok: false,
        reason: 'span-overlap',
        path,
        contestants: [regionA.templateName, regionB.templateName],
        regionKeys: [regionA.regionKey, regionB.regionKey],
        message:
          `Materialization conflict — path "${path}" has overlapping on-disk marker spans between ` +
          `${regionA.templateName}:${regionA.regionKey} and ${regionB.templateName}:${regionB.regionKey}; ` +
          'refusing the assembly and writing no file.',
      };
      // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-return-span-overlap
    }

    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-compose-union
    // Deterministic order — by owning identity, then region key — applied
    // uniformly across freshly extracted regions AND carried-forward blocks,
    // so re-materializing the same collision-free assembly always produces
    // byte-identical output regardless of whether a block was extracted or
    // carried forward.
    const allRegions: Array<{ templateName: string; regionKey: string; markerBlock: string }> = [
      ...extracted,
      ...carriedBlocks.map((block) => ({
        templateName: block.identity,
        regionKey: block.regionKey,
        markerBlock: block.text,
      })),
    ];
    const orderedRegions = allRegions.sort((a, b) =>
      a.templateName === b.templateName
        ? a.regionKey.localeCompare(b.regionKey)
        : a.templateName.localeCompare(b.templateName),
    );
    const composedContent = orderedRegions.map((region) => region.markerBlock).join('\n');
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-compose-union

    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-write-composed
    // Computed only — see inst-cs-write-materialized below for the actual write.
    materializedFiles.push({ path, content: composedContent });
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-write-composed
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-foreach-multi
  }

  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-write-materialized
  // Every target file path processed above with no refusal — write every
  // materialized file now, in one pass. A refusal reached while processing
  // any path returns before this loop runs, so the target repository
  // receives no write for a refused assembly (ADR-0032: "a refused assembly
  // writes zero files").
  for (const file of materializedFiles) {
    await writeFileFn(`${targetDir}/${file.path}`, file.content);
  }
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-write-materialized

  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-return-materialized
  return { ok: true, files: materializedFiles };
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-compose-shared-files:p1:inst-cs-return-materialized
}
