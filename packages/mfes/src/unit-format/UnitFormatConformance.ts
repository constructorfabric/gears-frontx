/**
 * `UnitFormatConformance` — the conformance suite shipped beside the unit
 * format contract. Any producing build's CI runs it against two independent
 * output directories of the same producer and the same inputs; any returned
 * violation fails the producer run and the output is not admitted for reuse
 * (`cpt-frontx-feature-unit-format-contract`,
 * `cpt-frontx-dod-unit-format-contract-conformance-suite-v2`).
 *
 * Checks: the fixed naming rules — chunks
 * `<pkg>@<version>/<path>.<sha256>.js`, fetch-list documents
 * `<pkg>@<version>/<entry>.list.<sha256>.json`, and pattern-matched files
 * `<pkg>@<version>/pattern/<name>.<sha256>.<ext>` — the content identity a
 * file name declares against the SHA-256 of its bytes, list-document
 * completeness (every `{ item }` edge resolves to an item on the same
 * list or its parent chain, every specifier edge of a delivered package
 * names an item's `answers` somewhere in the output and is answered by
 * exactly one item across the entry's combined lists — re-export chains,
 * namespace imports and `as default` all surface as specifier spellings
 * that must be answered once — every `lazy`/`patterns` reference names a
 * present document whose hash matches and whose items carry only what
 * the target needs beyond its parent chain, and every item's
 * `location`/`contentHash` names a present chunk of matching bytes),
 * the content-identity chain manifest → entry list document when a
 * manifest path is supplied, and byte identity across the output
 * directories. `checkConsumerIndependence` covers builds with different
 * consumer subsets: every `package@version` two of them emit must be
 * byte-identical under that package's directory.
 * The suite takes no type system and has no test-runner dependency —
 * it returns typed violations.
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { basename, dirname, join, relative, sep } from 'node:path';

import type { SharedDepFetchList, SharedDepImportEdge } from './fetch-list';
import type { UnitFormatViolation, UnitFormatViolationRule } from './UnitFormatViolation';

const LIST_NAME_PATTERN = /^.+\.list\.([0-9a-f]{64})\.json$/;
const UNIT_NAME_PATTERN = /^.+\.([0-9a-f]{64})\.js$/;
const PATTERN_FILE_NAME_PATTERN = /^.+\.([0-9a-f]{64})\.[a-z0-9]+$/i;
const NAME_HASH_PATTERN = /\.([0-9a-f]{64})\./;
const PACKAGE_DIR_PATTERN = /^(.+)@([^@/]+)$/;

interface ClassifiedFiles {
  /** Fetch-list documents `<entry>.list.<sha256>.json` under `<pkg>@<version>`. */
  lists: string[];
  /** Emitted chunks `<path>.<sha256>.js` under `<pkg>@<version>`. */
  units: string[];
  /** Pattern-matched files under `<pkg>@<version>/pattern/`. */
  patternFiles: string[];
}

/**
 * The conformance suite for the shared-dependency unit format contract.
 */
export class UnitFormatConformance {
  /**
   * Check two independent output directories of the same producer and the
   * same inputs. Returns one typed violation per contract failure — naming
   * the violated rule and the offending file — or an empty list when both
   * directories conform and agree byte for byte.
   */
  check(outputA: string, outputB: string, manifestPath?: string): UnitFormatViolation[] {
    return this.checkAll([outputA, outputB], manifestPath);
  }

  /**
   * Check any number of independent output directories of the same
   * producer and the same inputs — built under different install
   * layouts or consumer configs — and require them byte-identical:
   * each directory is checked against the contract, then every
   * directory is compared byte for byte against the first. Returns one
   * typed violation per contract failure — naming the violated rule and
   * the offending file — or an empty list when every directory conforms
   * and all agree byte for byte. A single directory checks conformance
   * only, with no pair to compare.
   */
  checkAll(outputDirs: readonly string[], manifestPath?: string): UnitFormatViolation[] {
    const violations: UnitFormatViolation[] = [];
    for (const dir of outputDirs) {
      violations.push(...this.checkOutput(dir));
    }
    const [first, ...rest] = outputDirs;
    if (first !== undefined) {
      for (const dir of rest) {
        violations.push(...this.compareOutputs(first, dir));
      }
    }
    if (manifestPath !== undefined && first !== undefined) {
      // Run once: the manifest→list leg resolves against the manifest's
      // own directory and declared bases, so checking it per output
      // directory only duplicates violations.
      violations.push(...this.checkManifestLeg(manifestPath, first));
    }
    return violations;
  }

  /**
   * The manifest→list leg of the hash chain: each `entryLists` reference
   * must name a file present relative to the manifest's shared base —
   * `metaData.sharedBase` when given, else `metaData.publicPath`, resolved
   * against the manifest file's directory when relative — and the file's
   * SHA-256 must equal the declared `contentHash`. A base or location
   * resolving to a remote URL has no filesystem leg to check and is
   * skipped.
   */
  private checkManifestLeg(manifestPath: string, dir: string): UnitFormatViolation[] {
    const violations: UnitFormatViolation[] = [];
    let manifest: {
      metaData?: { sharedBase?: unknown; publicPath?: unknown };
      entryLists?: Record<string, { location?: unknown; contentHash?: unknown }>;
    };
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      violations.push(
        this.violation(dir, manifestPath, 'list-format', `manifest is not parseable JSON: ${(error as Error).message}`),
      );
      return violations;
    }
    const manifestDir = dirname(manifestPath);
    const meta = manifest.metaData;
    const base =
      typeof meta?.sharedBase === 'string'
        ? meta.sharedBase
        : typeof meta?.publicPath === 'string'
          ? meta.publicPath
          : undefined;
    for (const [entry, ref] of Object.entries(manifest.entryLists ?? {})) {
      if (typeof ref?.location !== 'string' || typeof ref?.contentHash !== 'string') {
        violations.push(
          this.violation(dir, manifestPath, 'list-format', `manifest entryLists["${entry}"] lacks location/contentHash`),
        );
        continue;
      }
      const listPath = this.resolveListLocation(manifestDir, base, ref.location);
      if (listPath === undefined) {
        // An absolute-URL location or a remote base has no filesystem
        // file to check — the runtime verifies those at fetch time.
        continue;
      }
      let actual: string;
      try {
        actual = this.sha256File(listPath);
      } catch {
        violations.push(
          this.violation(dir, ref.location, 'hash-chain', `manifest declares ${entry} list at "${ref.location}" but no such file exists`),
        );
        continue;
      }
      if (actual !== ref.contentHash) {
        violations.push(
          this.violation(dir, ref.location, 'hash-chain', `manifest declares ${entry} list contentHash ${ref.contentHash} but file SHA-256 is ${actual}`),
        );
      }
    }
    return violations;
  }

  /**
   * Resolve a list `location` to a filesystem path by the contract
   * rule: relative to the manifest's shared base (`metaData.sharedBase`
   * when given, else `metaData.publicPath`), and relative to the
   * manifest file's directory when that base is relative. Returns
   * `undefined` when the location or the base is an absolute URL — a
   * remote reference has no file leg.
   */
  private resolveListLocation(
    manifestDir: string,
    base: string | undefined,
    location: string,
  ): string | undefined {
    if (/^https?:\/\//i.test(location)) return undefined;
    const relativeLocation = location.replace(/^\/+/, '');
    if (base === undefined || base === '') {
      return join(manifestDir, relativeLocation);
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(base)) return undefined;
    if (base.startsWith('//')) return undefined;
    const basePath = base.startsWith('/') ? base : join(manifestDir, base);
    return join(basePath, relativeLocation);
  }

  /**
   * Run the per-directory checks over one producer output directory:
   * file naming and each content-addressed name's hash against bytes.
   */
  private checkOutput(dir: string): UnitFormatViolation[] {
    const violations: UnitFormatViolation[] = [];
    const classified = this.classifyFiles(dir, violations);
    for (const listPath of classified.lists) {
      this.checkFileNameHash(dir, listPath, violations);
    }
    for (const unitPath of classified.units) {
      this.checkFileNameHash(dir, unitPath, violations);
    }
    for (const patternPath of classified.patternFiles) {
      this.checkFileNameHash(dir, patternPath, violations);
    }
    violations.push(...this.checkLists(dir, classified.lists));
    return violations;
  }

  /**
   * The list-document legs of the contract: each list parses; every
   * item's `location`/`contentHash` names a present chunk of matching
   * bytes; every `{ item }` edge resolves to an item on the same list;
   * every specifier edge is answered by an item's `answers` somewhere
   * in the output — when the specifier's root package is delivered in
   * this output (specifiers of packages outside the delivered set —
   * built-ins, optional peers, native-staying imports — keep their
   * native edge); and every `lazy`/`patterns` reference names a
   * present document whose hash matches.
   */
  private checkLists(dir: string, lists: readonly string[]): UnitFormatViolation[] {
    const violations: UnitFormatViolation[] = [];
    const parsed = new Map<string, SharedDepFetchList>();
    /** Answered specifiers and package roots across the whole output. */
    const answers = new Set<string>();
    const deliveredRoots = new Set<string>();
    for (const rel of lists) {
      let doc: SharedDepFetchList;
      try {
        doc = JSON.parse(readFileSync(join(dir, rel), 'utf8')) as SharedDepFetchList;
      } catch (error) {
        violations.push(
          this.violation(dir, rel, 'list-format', `fetch list is not parseable JSON: ${(error as Error).message}`),
        );
        continue;
      }
      parsed.set(rel, doc);
      for (const item of doc.items ?? []) {
        for (const answered of item.answers ?? []) answers.add(answered);
      }
      // Package identity keeps the scope: a scoped package's
      // directory is two segments — `@scope/name@version` — so the
      // delivered-root derivation must not stop at `@scope` alone or
      // every scoped package's completeness checks silently disable.
      const segments = rel.split(sep);
      const pkgDir =
        segments.length > 1 && segments[0]!.startsWith('@')
          ? `${segments[0]}${sep}${segments[1]}`
          : segments[0]!;
      const root = pkgDir.replace(/@[^@/\\]+$/, '');
      if (PACKAGE_DIR_PATTERN.test(pkgDir)) deliveredRoots.add(root);
    }
    // Parent/child links across each entry's combined lists: a
    // `lazy`/`patterns` reference names its dependent document by
    // location (relative to the shared base, '/'-separated).
    const parents = new Map<string, Set<string>>();
    const children = new Map<string, Set<string>>();
    const relOf = (location: string): string =>
      location.replace(/^\.?\//, '').split('/').join(sep);
    for (const [rel, doc] of parsed) {
      for (const record of [doc.lazy, doc.patterns]) {
        for (const ref of Object.values(record ?? {})) {
          const childRel = relOf(ref.location);
          if (!parsed.has(childRel)) continue;
          (children.get(rel) ?? children.set(rel, new Set()).get(rel)!).add(childRel);
          (parents.get(childRel) ?? parents.set(childRel, new Set()).get(childRel)!).add(rel);
        }
      }
    }
    const chain = (start: string, links: Map<string, Set<string>>): Set<string> => {
      const seen = new Set<string>();
      const queue = [...(links.get(start) ?? [])];
      while (queue.length > 0) {
        const next = queue.pop() as string;
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(...(links.get(next) ?? []));
      }
      return seen;
    };
    for (const [rel, doc] of parsed) {
      const ancestors = chain(rel, parents);
      // Items an `{ item }` edge may resolve to: the same list or its
      // parent chain (a lazy document's resolved edge legitimately
      // names a chunk the parent chain already delivers).
      const selfAndAncestors = new Set<string>([rel, ...ancestors]);
      const reachableHashes = new Set<string>();
      for (const r of selfAndAncestors) {
        for (const i of parsed.get(r)?.items ?? []) reachableHashes.add(i.contentHash);
      }
      // Every root-to-document chain a load can take: a document shared
      // by several entries sits on each of their chains, and each chain
      // is its own "combined lists". Answer uniqueness and the delta
      // property bind per chain, not over the union of all ancestors.
      const pathsToRoots = (start: string): string[][] => {
        const ups = [...(parents.get(start) ?? [])].filter((p) => parsed.has(p));
        if (ups.length === 0) return [[start]];
        const out: string[][] = [];
        for (const p of ups) {
          for (const tail of pathsToRoots(p)) {
            if (tail.includes(start)) continue;
            out.push([start, ...tail]);
          }
        }
        return out.length > 0 ? out : [[start]];
      };
      const paths = pathsToRoots(rel);
      const perChain: { answers: Map<string, number>; imported: Set<string>; ancestorHashes: Set<string> }[] =
        paths.map((path) => {
          const answers = new Map<string, number>();
          const imported = new Set<string>();
          const ancestorHashes = new Set<string>();
          for (const r of path) {
            for (const i of parsed.get(r)?.items ?? []) {
              for (const a of i.answers ?? []) answers.set(a, (answers.get(a) ?? 0) + 1);
              for (const e of i.imports ?? []) {
                if (typeof e === 'string') imported.add(e);
              }
              if (r !== rel) ancestorHashes.add(i.contentHash);
            }
          }
          return { answers, imported, ancestorHashes };
        });
      for (const item of doc.items ?? []) {
        if (perChain.some((c) => c.ancestorHashes.has(item.contentHash))) {
          violations.push(
            this.violation(dir, rel, 'list-completeness', `dependent list carries chunk ${item.contentHash} ("${item.location}") a parent chain's lists already deliver — lazy/pattern lists hold only the delta`),
          );
        }
        const chunkPath = join(dir, item.location);
        if (!existsSync(chunkPath)) {
          violations.push(
            this.violation(dir, rel, 'hash-chain', `list item names chunk "${item.location}" but no such file exists`),
          );
        } else {
          const actual = this.sha256File(chunkPath);
          if (actual !== item.contentHash) {
            violations.push(
              this.violation(dir, item.location, 'hash-chain', `list declares item contentHash ${item.contentHash} but file SHA-256 is ${actual}`),
            );
          }
        }
        for (const edge of (item.imports ?? []) as SharedDepImportEdge[]) {
          if (typeof edge !== 'string') {
            if (!reachableHashes.has(edge.item)) {
              violations.push(
                this.violation(dir, rel, 'list-completeness', `resolved item edge ${edge.item} of "${item.location}" has no answering item on this list or its parent chain`),
              );
            }
            continue;
          }
          if (isBuiltin(edge)) continue;
          const root = edge.startsWith('@')
            ? edge.split('/').slice(0, 2).join('/')
            : edge.split('/')[0];
          if (deliveredRoots.has(root) && !answers.has(edge)) {
            violations.push(
              this.violation(dir, rel, 'list-completeness', `specifier "${edge}" imported by "${item.location}" is answered by no emitted item`),
            );
          }
        }
      }
      // The uniqueness rule binds the specifiers a chain's lists
      // actually import — an extra item answering a specifier nothing
      // imports is spare capacity, not a double provision.
      const seenUniques = new Set<string>();
      for (const c of perChain) {
        for (const [specifier, count] of c.answers) {
          if (count > 1 && c.imported.has(specifier) && !seenUniques.has(specifier)) {
            seenUniques.add(specifier);
            violations.push(
              this.violation(dir, rel, 'list-completeness', `specifier "${specifier}" is imported by the combined lists but answered by ${count} items — exactly one item must answer it`),
            );
          }
        }
      }
      for (const record of [doc.lazy, doc.patterns]) {
        for (const [key, ref] of Object.entries(record ?? {})) {
          const docPath = join(dir, ref.location);
          if (!existsSync(docPath)) {
            violations.push(
              this.violation(dir, rel, 'hash-chain', `list references "${key}" at "${ref.location}" but no such file exists`),
            );
            continue;
          }
          const actual = this.sha256File(docPath);
          if (actual !== ref.contentHash) {
            violations.push(
              this.violation(dir, ref.location, 'hash-chain', `list declares "${key}" contentHash ${ref.contentHash} but file SHA-256 is ${actual}`),
            );
          }
        }
      }
    }
    return violations;
  }

  /**
   * Consumer independence: given output directories of DIFFERENT builds —
   * different consumer subsets of the shared packages, so their package
   * sets may legitimately differ — every `<pkg>@<version>` directory two
   * of them emit must be byte-identical underneath: identical file sets,
   * identical bytes per file. Package directories only one build emits
   * are out of scope; the chunks of a package must not depend on which
   * subset the consumer used.
   */
  checkConsumerIndependence(outputDirs: readonly string[]): UnitFormatViolation[] {
    const violations: UnitFormatViolation[] = [];
    /** package dir key (`<pkg>@<version>`, '/'-joined) → per-output absolute dirs. */
    const byPackage = new Map<string, string[]>();
    for (const dir of outputDirs) {
      for (const rel of this.packageDirs(dir)) {
        (byPackage.get(rel) ?? byPackage.set(rel, []).get(rel)!).push(dir);
      }
    }
    for (const [pkg, dirs] of byPackage) {
      if (dirs.length < 2) continue;
      const [first, ...rest] = dirs as [string, ...string[]];
      const pkgRel = pkg.split('/').join(sep);
      const base = join(first, pkgRel);
      const filesFirst = new Map(this.listFiles(base).map((f) => [relative(base, f), f] as const));
      for (const other of rest) {
        const otherBase = join(other, pkgRel);
        const filesOther = new Map(this.listFiles(otherBase).map((f) => [relative(otherBase, f), f] as const));
        for (const rel of filesFirst.keys()) {
          if (!filesOther.has(rel)) {
            violations.push(
              this.violation(other, `${pkgRel}${sep}${rel}`, 'consumer-independence', `${pkg} file present in ${first} but absent from ${other}`),
            );
          }
        }
        for (const rel of filesOther.keys()) {
          if (!filesFirst.has(rel)) {
            violations.push(
              this.violation(first, `${pkgRel}${sep}${rel}`, 'consumer-independence', `${pkg} file present in ${other} but absent from ${first}`),
            );
          }
        }
        for (const [rel, pathA] of filesFirst) {
          const pathB = filesOther.get(rel);
          if (pathB !== undefined && !readFileSync(pathA).equals(readFileSync(pathB))) {
            violations.push(
              this.violation(first, `${pkgRel}${sep}${rel}`, 'consumer-independence', `${pkg} file "${rel}" differs between ${first} and ${other} — chunk bytes depend on the consumer subset`),
            );
          }
        }
      }
    }
    return violations;
  }

  /** `<pkg>@<version>` directory names (relative, '/'-joined) under `dir`. */
  private packageDirs(dir: string): string[] {
    const found: string[] = [];
    const scan = (abs: string, rel: string): void => {
      for (const entry of readdirSync(abs, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
        const leaf = entry.name.startsWith('@') ? childRel : entry.name;
        if (PACKAGE_DIR_PATTERN.test(leaf)) {
          found.push(childRel);
        } else if (entry.name.startsWith('@') && rel === '') {
          scan(join(abs, entry.name), childRel);
        }
      }
    };
    scan(dir, '');
    return found;
  }

  /**
   * Walk an output directory and classify every file by the contract's
   * naming rules; files matching none are naming violations.
   */
  private classifyFiles(dir: string, violations: UnitFormatViolation[]): ClassifiedFiles {
    const classified: ClassifiedFiles = {
      lists: [],
      units: [],
      patternFiles: [],
    };
    for (const file of this.listFiles(dir)) {
      const rel = relative(dir, file);
      const base = basename(rel);
      if (LIST_NAME_PATTERN.test(base)) {
        const parent = basename(dirname(rel));
        if (dirname(rel) === '.' || !PACKAGE_DIR_PATTERN.test(parent)) {
          violations.push(
            this.violation(dir, rel, 'naming', `list file "${rel}" is not inside a "<pkg>@<version>" directory`),
          );
        }
        classified.lists.push(rel);
      } else if (
        basename(dirname(rel)) === 'pattern' &&
        dirname(dirname(rel)) !== '.' &&
        PACKAGE_DIR_PATTERN.test(basename(dirname(dirname(rel)))) &&
        PATTERN_FILE_NAME_PATTERN.test(base)
      ) {
        // `<pkg>@<version>/pattern/<name>.<sha256>.<ext>` — a file a
        // statically bounded pattern import matched.
        classified.patternFiles.push(rel);
      } else if (UNIT_NAME_PATTERN.test(base)) {
        const parent = basename(dirname(rel));
        if (dirname(rel) === '.' || !PACKAGE_DIR_PATTERN.test(parent)) {
          violations.push(
            this.violation(dir, rel, 'naming', `unit file "${rel}" is not inside a "<pkg>@<version>" directory`),
          );
        }
        classified.units.push(rel);
      } else {
        violations.push(this.violation(dir, rel, 'naming', `file "${rel}" matches no unit-format naming rule`));
      }
    }
    return classified;
  }

  /**
   * Verify that a content-addressed file's name hash equals the SHA-256 of
   * its bytes.
   */
  private checkFileNameHash(dir: string, rel: string, violations: UnitFormatViolation[]): void {
    const match = basename(rel).match(NAME_HASH_PATTERN);
    if (match === null) return;
    const actual = this.sha256File(join(dir, rel));
    if (actual !== match[1]) {
      violations.push(
        this.violation(dir, rel, 'hash-chain', `file name hash ${match[1]} does not match content SHA-256 ${actual}`),
      );
    }
  }

  /**
   * Compare two output directories byte for byte: identical relative file
   * sets, identical bytes per file.
   */
  private compareOutputs(dirA: string, dirB: string): UnitFormatViolation[] {
    const violations: UnitFormatViolation[] = [];
    const filesA = new Map(this.listFiles(dirA).map((f) => [relative(dirA, f), f] as const));
    const filesB = new Map(this.listFiles(dirB).map((f) => [relative(dirB, f), f] as const));
    for (const rel of filesA.keys()) {
      if (!filesB.has(rel)) {
        violations.push(this.violation(dirB, rel, 'byte-identity', `present in ${dirA} but absent from ${dirB}`));
      }
    }
    for (const rel of filesB.keys()) {
      if (!filesA.has(rel)) {
        violations.push(this.violation(dirA, rel, 'byte-identity', `present in ${dirB} but absent from ${dirA}`));
      }
    }
    for (const [rel, pathA] of filesA) {
      const pathB = filesB.get(rel);
      if (pathB !== undefined && !readFileSync(pathA).equals(readFileSync(pathB))) {
        violations.push(this.violation(dirA, rel, 'byte-identity', `file "${rel}" differs between ${dirA} and ${dirB}`));
      }
    }
    return violations;
  }

  /** Recursively list every regular file under `dir`. */
  private listFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        files.push(...this.listFiles(path));
      } else {
        files.push(path);
      }
    }
    return files;
  }

  private sha256File(path: string): string {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  }

  private violation(
    dir: string,
    rel: string,
    rule: UnitFormatViolationRule,
    detail: string,
  ): UnitFormatViolation {
    const file = rel.startsWith(dir) ? rel : `${dir}${sep}${rel}`;
    return { rule, file, detail };
  }
}
