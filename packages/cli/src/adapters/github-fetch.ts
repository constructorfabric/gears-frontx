// @cpt-algo:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1
// @cpt-algo:cpt-frontx-algo-template-resolution-bounded-update:p1
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { BUNDLE_MARKER, BinaryBundleValue, encodeBundleValue } from '../bundle/envelope';
import { setOwn } from '../own-record';
import type { FetchFn, FetchResult } from '../resolver/types';

// Trust boundary: the pin is the commit GitHub's TLS response states for the
// fetched archive (the global PAX `comment`, lowercase 40-hex), and the
// content is that archive's regular files. Nothing here verifies the content
// cryptographically against the Git object. The typed `@ref` is deliberately
// not compared with the pin: under this boundary the stated commit IS what
// GitHub resolved the selector to, and any comparison either fails open
// (uppercase input, tag-object selectors) or refuses legitimate hex-looking
// branch and tag names.
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
// Shape only: GitHub's root is `<owner>-<repo>-<abbrev>`, and for an annotated
// tag the abbreviation names the tag object, not the commit.
const ROOT_SUFFIX_PATTERN = /^[0-9a-f]{7,40}$/i;

// Real network `FetchFn` implementation — the source-registry actor
// (`cpt-frontx-actor-github`) this package fetches template content from at
// install (`inst-resolve-fetch`) and bounded local-update
// (`inst-bupd-fetch`) time. Given the fetch address the pure-logic resolver
// already built (`resolveToInventory`'s `buildFetchUrl`,
// `cpt-frontx-algo-template-resolution-resolve-to-inventory` inst-resolve-addr),
// this adapter performs the actual HTTP GET against the GitHub source
// registry, then GUNZIPs + UNTARs the response body (GitHub's tarball
// endpoint returns a gzipped tar of the repo at the given ref) and returns
// the `{ "$frontxTemplateFiles": { <relative path>: <file text>, ... } }`
// bundle envelope that `FsContentStore.writeBundle`
// (`packages/cli/src/adapters/fs-content-store.ts`) already materializes
// into the template's actual on-disk files
// (`cpt-frontx-dod-template-resolution-install-by-spec`, `inst-resolve-write`,
// `inst-install-materialize`) — never a single opaque blob. The envelope is
// returned as its JSON-serialized string form, alongside the full commit SHA
// the archive's global PAX header states (`inst-resolve-pin`) and the paths of
// any symlink entries — the `FetchFn` seam contract
// (`packages/cli/src/resolver/types.ts`) widens additively to
// `Promise<string | FetchResult>` for exactly this: an adapter with a pin to
// report returns `FetchResult`, one without (still) returns a bare string.
// Pure-logic core (`resolver/resolve.ts`, `inventory/TemplateInventory.ts`)
// interprets that union; this file is the IO-only realization plugged in
// behind the same injected seam.
export interface GithubFetchOptions {
  /** Optional bearer token for authenticated requests against private repos / higher rate limits. */
  token?: string;
  /** Injectable fetch implementation — defaults to the platform global `fetch`. Enables deterministic tests. */
  fetchImpl?: typeof fetch;
  /** Extra headers merged into every request (e.g. Accept override). */
  headers?: Record<string, string>;
  /** Cap on the gzipped response body, in bytes. Defaults to `MAX_ARCHIVE_BYTES`. */
  maxArchiveBytes?: number;
  /** Cap on the gunzipped tar, in bytes. Defaults to `MAX_EXPANDED_BYTES`. */
  maxExpandedBytes?: number;
}

// Resource bounds for an untrusted response, checked before any allocation
// grows past them: the body is read chunk by chunk and abandoned once over the
// archive cap, and gunzip stops at the expanded cap (zlib `maxOutputLength`),
// so a gzip bomb fails fast instead of exhausting memory. Template archives are
// far below both. The tar is walked within the expanded buffer, so the entry
// count is bounded by `MAX_EXPANDED_BYTES / 512` without a separate cap.
export const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
export const MAX_EXPANDED_BYTES = 256 * 1024 * 1024;

export function createGithubFetchFn(options: GithubFetchOptions = {}): FetchFn {
  const fetchImpl = options.fetchImpl ?? fetch;

  return async function githubFetch(url: string): Promise<FetchResult> {
    const headers: Record<string, string> = {
      'User-Agent': '@gears-frontx/cli',
      Accept: 'application/vnd.github+json',
      ...options.headers,
    };
    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }

    // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-fetch
    // @cpt-begin:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-fetch
    const response = await fetchImpl(url, { headers });
    if (!response.ok) {
      throw new Error(
        `GitHub fetch failed for "${url}": ${response.status} ${response.statusText}`,
      );
    }
    const tarballBytes = await readBoundedBody(url, response, options.maxArchiveBytes ?? MAX_ARCHIVE_BYTES);
    const { files, pinnedRef, symlinks } = unpackGithubTarball(
      url,
      tarballBytes,
      options.maxExpandedBytes ?? MAX_EXPANDED_BYTES,
    );
    const content = JSON.stringify({ [BUNDLE_MARKER]: files });
    // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-pin
    // The full commit the archive states, never the typed `@ref`. Symlinks are
    // reported, not materialized; the resolver refuses any inside the scope it
    // keeps (after subtree narrowing), so nothing is silently dropped.
    return { content, pinnedRef, symlinks };
    // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-pin
    // @cpt-end:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-fetch
    // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-fetch
  };
}

const TAR_BLOCK_SIZE = 512;

async function readBoundedBody(url: string, response: Response, limit: number): Promise<Buffer> {
  const tooLarge = (): Error =>
    new Error(`GitHub tarball for "${url}" exceeds the ${limit}-byte archive limit; the archive was refused.`);
  // A declared length over the cap refuses before any byte is read.
  if (Number(response.headers.get('content-length')) > limit) throw tooLarge();
  if (response.body === null) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  // Throwing out of the loop cancels the stream, so the rest is never fetched.
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value;
    total += chunk.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

interface UnpackedGithubTarball {
  files: Record<string, BinaryBundleValue>;
  // The full lowercase 40-hex commit from the archive's global PAX `comment`.
  pinnedRef: string;
  // Root-relative paths of symlink entries, recorded but never materialized.
  symlinks: string[];
}

// Keys a per-file `x` header may carry: `path` becomes the effective name;
// the rest cannot change framing or content and are ignored. Any other key
// (notably `size`) refuses.
const PER_FILE_PAX_KEYS = new Set(['path', 'mtime', 'atime', 'ctime', 'linkpath']);
const UTF8 = new TextDecoder('utf-8', { fatal: true });

/**
 * GUNZIPs the GitHub tarball response and UNTARs it, strictly: header
 * checksums, octal sizes, padding and the end-of-archive marker are checked;
 * PAX records are parsed by an exact byte-counted grammar; only regular files,
 * directories and symlinks are accepted; every name must share one
 * `<owner>-<repo>-<abbrev>/` root. Any deviation throws an `Error` naming the
 * URL, before any content is returned.
 */
function unpackGithubTarball(url: string, tarballBytes: Buffer, maxExpandedBytes: number): UnpackedGithubTarball {
  let tar: Buffer;
  try {
    tar = zlib.gunzipSync(tarballBytes, { maxOutputLength: maxExpandedBytes });
  } catch (err) {
    if ((err as { code?: unknown }).code === 'ERR_BUFFER_TOO_LARGE') {
      throw Object.assign(
        new Error(
          `GitHub tarball for "${url}" expands past the ${maxExpandedBytes}-byte limit; the archive was refused.`,
        ),
        { cause: err },
      );
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw Object.assign(
      new Error(`GitHub tarball for "${url}" is not valid gzip data: ${detail}`),
      { cause: err }
    );
  }
  const refuse = (why: string): Error => new Error(`GitHub tarball for "${url}" ${why}; the archive was refused.`);

  const files: Record<string, BinaryBundleValue> = {};
  const symlinks: string[] = [];
  const taken = new Set<string>();
  let commit: string | undefined;
  let sawGlobal = false;
  let sawEntry = false;
  let pending: Map<string, string> | undefined;
  let root: string | undefined;
  let sawRootDir = false;
  let offset = 0;

  for (;;) {
    if (offset + TAR_BLOCK_SIZE > tar.length) throw refuse('ends before its end-of-archive marker');
    const header = tar.subarray(offset, offset + TAR_BLOCK_SIZE);
    if (header.every((byte) => byte === 0)) {
      if (pending !== undefined) throw refuse('ends with a per-file PAX header that precedes no entry');
      const tail = tar.subarray(offset + TAR_BLOCK_SIZE);
      if (tail.length < TAR_BLOCK_SIZE || tail.some((byte) => byte !== 0)) {
        throw refuse('has a malformed end-of-archive marker');
      }
      break;
    }

    const checksum = parseOctalField(header, 148, 8);
    let sum = 0;
    for (let index = 0; index < TAR_BLOCK_SIZE; index++) sum += index >= 148 && index < 156 ? 0x20 : header[index]!;
    if (checksum === undefined || checksum !== sum) throw refuse(`has a bad header checksum at offset ${offset}`);
    const size = parseOctalField(header, 124, 12);
    if (size === undefined) throw refuse(`has a malformed entry size at offset ${offset}`);
    const bodyStart = offset + TAR_BLOCK_SIZE;
    const next = bodyStart + Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
    if (next > tar.length) throw refuse(`is truncated at offset ${offset}`);
    const body = tar.subarray(bodyStart, bodyStart + size);
    offset = next;

    const typeflag = String.fromCharCode(header[156]!);
    if (typeflag === 'g') {
      if (sawGlobal || sawEntry || pending !== undefined) throw refuse('has a misplaced or repeated global PAX header');
      sawGlobal = true;
      const records = parsePaxRecords(body, refuse);
      for (const key of records.keys()) if (key !== 'comment') throw refuse(`has an unsupported global PAX key "${key}"`);
      const comment = records.get('comment');
      if (comment === undefined || !COMMIT_SHA_PATTERN.test(comment)) {
        throw refuse('does not state a 40-hex commit in its global PAX comment');
      }
      commit = comment;
      continue;
    }
    if (typeflag === 'x') {
      if (pending !== undefined) throw refuse('has two consecutive per-file PAX headers');
      pending = parsePaxRecords(body, refuse);
      for (const key of pending.keys()) if (!PER_FILE_PAX_KEYS.has(key)) throw refuse(`has an unsupported per-file PAX key "${key}"`);
      sawEntry = true;
      continue;
    }
    if (typeflag !== '0' && typeflag !== '\0' && typeflag !== '5' && typeflag !== '2') {
      throw refuse(`has an unsupported entry type ${JSON.stringify(typeflag)}`);
    }
    sawEntry = true;

    const name = pending?.get('path') ?? ustarName(header);
    pending = undefined;
    // A regular file's key below the root is judged by the shared resolver
    // (`inst-resolve-bundle-keys`, `INVALID_PATH`) after subtree narrowing, so
    // one rule covers every adapter; entries never materialized are judged here.
    if (typeflag !== '0' && typeflag !== '\0' && (name.includes('\0') || name.startsWith('/') || name.split('/').includes('..'))) {
      throw refuse(`has an unsafe entry name ${JSON.stringify(name)}`);
    }
    const separator = name.indexOf('/');
    const first = separator === -1 ? name : name.slice(0, separator);
    if (root === undefined) {
      const dash = first.lastIndexOf('-');
      if (dash === -1 || !ROOT_SUFFIX_PATTERN.test(first.slice(dash + 1))) {
        throw refuse(`has no <owner>-<repo>-<sha> root directory`);
      }
      root = first;
    } else if (first !== root) {
      throw refuse('has entries under more than one root directory');
    }
    const relative = separator === -1 ? '' : name.slice(separator + 1).replace(/\/$/, '');
    if (relative === '') {
      // Exactly one directory entry may name the root itself; GitHub emits it first.
      if (typeflag === '5' && !sawRootDir) {
        sawRootDir = true;
        continue;
      }
      throw refuse(`has an entry with no path below the root: ${JSON.stringify(name)}`);
    }
    if (typeflag === '5') continue;
    if (taken.has(relative)) throw refuse(`has two entries for "${relative}"`);
    taken.add(relative);
    if (typeflag === '2') {
      symlinks.push(relative);
      continue;
    }
    setOwn(files, relative, encodeBundleValue(body));
  }

  // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-pin
  if (commit === undefined) throw refuse('does not state a commit (no global PAX header)');
  // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-pin
  if (Object.keys(files).length === 0) {
    throw new Error(`GitHub tarball for "${url}" unpacked to zero files.`);
  }
  return { files, pinnedRef: commit, symlinks };
}

// Strict octal: digits 0-7 only, then at least one NUL/space terminator to the
// end of the field. A sign, a leading blank, a digit 8/9 or GNU base-256
// (high bit set) all yield `undefined`.
function parseOctalField(header: Buffer, start: number, length: number): number | undefined {
  const field = header.toString('latin1', start, start + length);
  const match = /^([0-7]+)[\0 ]+$/.exec(field);
  return match ? parseInt(match[1]!, 8) : undefined;
}

function ustarName(header: Buffer): string {
  const field = (start: number, end: number): string => {
    const bytes = header.subarray(start, end);
    const nul = bytes.indexOf(0);
    return bytes.subarray(0, nul === -1 ? bytes.length : nul).toString('utf-8');
  };
  const name = field(0, 100);
  const prefix = header.toString('latin1', 257, 262) === 'ustar' ? field(345, 500) : '';
  return prefix ? `${prefix}/${name}` : name;
}

// `<len> <key>=<value>\n` records, `len` the exact byte count of the record
// (1-6 digits, no leading zero). Records must consume the body exactly; only
// trailing NUL padding is tolerated. Repeated keys, invalid UTF-8 values, and
// every other deviation refuse — nothing is skipped as best effort.
function parsePaxRecords(body: Buffer, refuse: (why: string) => Error): Map<string, string> {
  const records = new Map<string, string>();
  let index = 0;
  while (index < body.length) {
    if (body[index] === 0) {
      if (body.subarray(index).some((byte) => byte !== 0)) throw refuse('has a malformed PAX header');
      break;
    }
    const space = body.indexOf(0x20, index);
    const digits = space === -1 ? '' : body.toString('latin1', index, space);
    if (!/^[1-9][0-9]{0,5}$/.test(digits)) throw refuse('has a malformed PAX record length');
    const end = index + Number(digits);
    if (end > body.length || end - 1 <= space || body[end - 1] !== 0x0a) throw refuse('has a malformed PAX record');
    const record = body.subarray(space + 1, end - 1);
    const equals = record.indexOf(0x3d);
    const key = equals <= 0 ? '' : record.toString('latin1', 0, equals);
    if (!/^[\x21-\x7e]+$/.test(key)) throw refuse('has a malformed PAX record key');
    let value: string;
    try {
      value = UTF8.decode(record.subarray(equals + 1));
    } catch {
      throw refuse('has a PAX record value that is not valid UTF-8');
    }
    if (records.has(key)) throw refuse(`repeats the PAX key "${key}"`);
    records.set(key, value);
    index = end;
  }
  return records;
}

// Inventory-root path resolution — the local inventory store root
// (`cpt-frontx-adr-template-acquisition-and-location`) that
// `resolveInstalledContentPath` (`fs-installed-content-path.ts`) resolves
// every installed template's on-disk path relative to. Not itself a
// CDSL-designated instruction (like `resolveInstalledContentPath`, it carries
// no @cpt-begin/@cpt-end marker of its own), but the IO-only decision this
// phase must supply: where the tracked local inventory lives on disk.
//
// Precedence: an explicit `FRONTX_INVENTORY_ROOT` override — resolved against
// `cwd` when given as a relative path — takes precedence over the default
// per-user home-directory location (`~/.frontx/inventory`), so a developer or
// CI job can redirect the inventory into a project-local or ephemeral
// directory without changing any calling code.
export interface ResolveInventoryRootOptions {
  cwd?: string;
  env?: Partial<Record<string, string | undefined>>;
}

export function resolveInventoryRoot(options: ResolveInventoryRootOptions = {}): string {
  const env = options.env ?? process.env;
  const override = env.FRONTX_INVENTORY_ROOT;
  if (override) {
    return path.isAbsolute(override) ? override : path.resolve(options.cwd ?? process.cwd(), override);
  }
  return path.join(os.homedir(), '.frontx', 'inventory');
}
