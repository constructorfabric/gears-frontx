// @cpt-algo:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1
// @cpt-algo:cpt-frontx-algo-template-resolution-bounded-update:p1
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { BUNDLE_MARKER } from '../bundle/envelope';
import type { FetchFn } from '../resolver/types';

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
// `inst-install-materialize`) — never a single opaque blob. The `FetchFn`
// seam contract's signature (`packages/cli/src/resolver/types.ts`,
// `Promise<string>`) is unchanged: the envelope is returned as its
// JSON-serialized string form. Pure-logic core (`resolver/resolve.ts`,
// `inventory/TemplateInventory.ts`) is untouched; this file is the IO-only
// realization plugged in behind the same injected seam.
export interface GithubFetchOptions {
  /** Optional bearer token for authenticated requests against private repos / higher rate limits. */
  token?: string;
  /** Injectable fetch implementation — defaults to the platform global `fetch`. Enables deterministic tests. */
  fetchImpl?: typeof fetch;
  /** Extra headers merged into every request (e.g. Accept override). */
  headers?: Record<string, string>;
}

export function createGithubFetchFn(options: GithubFetchOptions = {}): FetchFn {
  const fetchImpl = options.fetchImpl ?? fetch;

  return async function githubFetch(url: string): Promise<string> {
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
    const tarballBytes = Buffer.from(await response.arrayBuffer());
    const files = unpackGithubTarball(url, tarballBytes);
    return JSON.stringify({ [BUNDLE_MARKER]: files });
    // @cpt-end:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-fetch
    // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-fetch
  };
}

const TAR_BLOCK_SIZE = 512;

/**
 * GUNZIPs the GitHub tarball response and UNTARs it into a flat map of
 * `relative path -> file text`, stripping the single top-level
 * `<owner>-<repo>-<sha>/` directory GitHub always wraps tarball content in.
 * Fails explicitly (clear error, no silent passthrough) on undecodable gzip
 * data, a malformed tar stream, or a tarball that yields zero files.
 */
function unpackGithubTarball(url: string, tarballBytes: Buffer): Record<string, string> {
  let tarBytes: Buffer;
  try {
    tarBytes = zlib.gunzipSync(tarballBytes);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw Object.assign(
      new Error(`GitHub tarball for "${url}" is not valid gzip data: ${detail}`),
      { cause: err }
    );
  }

  const files: Record<string, string> = {};
  let offset = 0;
  while (offset + TAR_BLOCK_SIZE <= tarBytes.length) {
    const header = tarBytes.subarray(offset, offset + TAR_BLOCK_SIZE);
    if (header.every((byte) => byte === 0)) break; // end-of-archive marker

    const rawName = header.subarray(0, 100).toString('utf-8').replace(/\0.*$/, '');
    const sizeField = header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim();
    const size = sizeField.length > 0 ? parseInt(sizeField, 8) : 0;
    if (Number.isNaN(size) || size < 0) {
      throw new Error(`GitHub tarball for "${url}" has a malformed entry size at offset ${offset}.`);
    }
    const typeflag = String.fromCharCode(header[156] ?? 0);
    const magic = header.subarray(257, 263).toString('ascii');
    const prefix =
      magic.startsWith('ustar') ? header.subarray(345, 500).toString('utf-8').replace(/\0.*$/, '') : '';
    const entryName = prefix ? `${prefix}/${rawName}` : rawName;

    offset += TAR_BLOCK_SIZE;
    if (offset + size > tarBytes.length) {
      throw new Error(`GitHub tarball for "${url}" is truncated at entry "${entryName}".`);
    }
    const content = tarBytes.subarray(offset, offset + size);
    offset += Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;

    // '0' and '\0' are regular files; directories ('5'), pax/global-pax
    // extended headers ('x'/'g'), and other typeflags carry no materializable
    // file content for this adapter's purposes.
    if (typeflag !== '0' && typeflag !== '\0') continue;

    // Strip the single top-level `<owner>-<repo>-<sha>/` directory segment
    // GitHub always wraps tarball content in.
    const separatorIndex = entryName.indexOf('/');
    const relativePath = separatorIndex >= 0 ? entryName.slice(separatorIndex + 1) : entryName;
    if (relativePath.length === 0) continue;

    files[relativePath] = content.toString('utf-8');
  }

  if (Object.keys(files).length === 0) {
    throw new Error(`GitHub tarball for "${url}" unpacked to zero files.`);
  }

  return files;
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
