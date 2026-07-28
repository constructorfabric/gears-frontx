// @cpt-algo:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1
// @cpt-algo:cpt-frontx-algo-template-resolution-bounded-update:p1
// @cpt-dod:cpt-frontx-dod-template-resolution-install-by-spec:p1
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, it, expect, vi } from 'vitest';
import { createGithubFetchFn, resolveInventoryRoot } from '../github-fetch';
import { parseSourceSpec } from '../../spec-parser/parse';
import { resolveToInventory } from '../../resolver/resolve';

const TAR_BLOCK_SIZE = 512;

/** Builds a minimal ustar-format tar buffer wrapping `files` under a single
 * top-level `<owner>-<repo>-<sha>/` directory, matching the shape a GitHub
 * tarball-endpoint response has (before gzip). */
function makeGithubTarball(files: Record<string, string>, topLevelDir = 'acme-my-template-abc123'): Buffer {
  const chunks: Buffer[] = [];
  for (const [relativePath, content] of Object.entries(files)) {
    const contentBuffer = Buffer.from(content, 'utf-8');
    const header = Buffer.alloc(TAR_BLOCK_SIZE);
    const name = `${topLevelDir}/${relativePath}`;
    header.write(name, 0, 'utf-8');
    header.write('0000644\0', 100, 'ascii'); // mode
    header.write('0000000\0', 108, 'ascii'); // uid
    header.write('0000000\0', 116, 'ascii'); // gid
    header.write(`${contentBuffer.length.toString(8).padStart(11, '0')}\0`, 124, 'ascii'); // size
    header.write('00000000000\0', 136, 'ascii'); // mtime
    header.write('        ', 148, 'ascii'); // checksum placeholder (blanks) — permissive reader ignores it
    header.write('0', 156, 'ascii'); // typeflag: regular file
    header.write('ustar\x00\x00', 257, 'ascii'); // magic + version
    chunks.push(header);
    const padded = Math.ceil(contentBuffer.length / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
    const contentBlock = Buffer.alloc(padded);
    contentBuffer.copy(contentBlock);
    chunks.push(contentBlock);
  }
  chunks.push(Buffer.alloc(TAR_BLOCK_SIZE * 2)); // end-of-archive marker
  return Buffer.concat(chunks);
}

function makeGithubTarballResponse(files: Record<string, string>): Response {
  const gzipped = zlib.gzipSync(makeGithubTarball(files));
  return new Response(gzipped, { status: 200, statusText: 'OK' });
}

describe('createGithubFetchFn', () => {
  // inst-resolve-fetch / inst-resolve-addr — real fetch against the source
  // registry (cpt-frontx-actor-github) at the resolved ref, end-to-end
  // through parseSourceSpec -> resolveToInventory -> the real FetchFn, which
  // now GUNZIPs + UNTARs the tarball response into the
  // `$frontxTemplateFiles` bundle envelope `FsContentStore.writeBundle`
  // consumes.
  it('(a) fetches template content from the source registry, unpacks the tarball, and returns the bundle envelope — happy path', async () => {
    // Real contract fixture: the manifest FILENAME is `frontx-template.json`
    // (MANIFEST_FILENAME, `manifest/types.ts`) and identity is carried by the
    // `name` field (`manifest/validate-contract.ts`) — NOT `frontx.template.json`
    // with an `identity` field, which is not a shape this codebase ever reads.
    // "acme-widgets" is deliberately different from the repository segment
    // ("my-template" in the source-spec below), proving identity comes from
    // the manifest rather than from the repository name.
    const manifestJson = JSON.stringify({
      name: 'acme-widgets',
      version: '1.0.0',
      ownershipBoundaries: { exclusiveSubtrees: [], sharedFiles: [] },
    });
    const fetchImpl = vi.fn(async () =>
      makeGithubTarballResponse({ 'frontx-template.json': manifestJson, 'src/index.ts': 'export {};' }),
    ) as unknown as typeof fetch;

    const fetchFn = createGithubFetchFn({ fetchImpl });

    const parsed = parseSourceSpec('github:acme/my-template@v1.0.0');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const resolved = await resolveToInventory(parsed.value, fetchFn);

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(JSON.parse(resolved.value.content)).toEqual({
        $frontxTemplateFiles: {
          'frontx-template.json': manifestJson,
          'src/index.ts': 'export {};',
        },
      });
      expect(resolved.value.name).toBe('acme-widgets');
    }
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/repos/acme/my-template/tarball/v1.0.0',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  // inst-resolve-write / inst-install-materialize — malformed/undecodable
  // tarball content fails explicitly rather than silently passing through.
  it('(d) rejects with a clear error when the response body is not valid gzip data', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('not-gzip-bytes', { status: 200, statusText: 'OK' }),
    ) as unknown as typeof fetch;

    const fetchFn = createGithubFetchFn({ fetchImpl });

    await expect(fetchFn('https://api.github.com/repos/acme/my-template/tarball/v1.0.0')).rejects.toThrow(
      /not valid gzip data/,
    );
  });

  // inst-resolve-fetch-fail / inst-bupd-fetch-fail — rejection/error case:
  // the source registry returns a non-OK status; the real FetchFn throws so
  // the resolver reports a resolution error and writes nothing.
  it('(b) rejects when the source registry responds with a non-OK status', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('not found', { status: 404, statusText: 'Not Found' }),
    ) as unknown as typeof fetch;

    const fetchFn = createGithubFetchFn({ fetchImpl });

    await expect(fetchFn('https://api.github.com/repos/acme/missing/tarball/v1.0.0')).rejects.toThrow(
      /404/,
    );

    const parsed = parseSourceSpec('github:acme/missing@v1.0.0');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const resolved = await resolveToInventory(parsed.value, fetchFn);
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.error.message).toContain('Failed to fetch template from registry');
    }
  });

  it('(c) attaches an Authorization header when a token is supplied', async () => {
    const fetchImpl = vi.fn(async () =>
      makeGithubTarballResponse({ 'frontx.template.json': '{}' }),
    ) as unknown as typeof fetch;
    const fetchFn = createGithubFetchFn({ fetchImpl, token: 'abc123' });

    await fetchFn('https://api.github.com/repos/acme/my-template/tarball/v1.0.0');

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer abc123' }) }),
    );
  });
});

describe('resolveInventoryRoot', () => {
  // Inventory-root path resolution — homedir default vs cwd-relative override.
  it('(a) defaults to ~/.frontx/inventory under the user home directory', () => {
    const result = resolveInventoryRoot({ env: {} });
    expect(result).toBe(path.join(os.homedir(), '.frontx', 'inventory'));
  });

  it('(b) resolves a relative FRONTX_INVENTORY_ROOT override against the given cwd', () => {
    const result = resolveInventoryRoot({
      cwd: '/workspace/project',
      env: { FRONTX_INVENTORY_ROOT: '.frontx-inventory' },
    });
    expect(result).toBe(path.resolve('/workspace/project', '.frontx-inventory'));
  });

  it('(c) uses an absolute FRONTX_INVENTORY_ROOT override verbatim, ignoring cwd', () => {
    const result = resolveInventoryRoot({
      cwd: '/workspace/project',
      env: { FRONTX_INVENTORY_ROOT: '/custom/inventory-root' },
    });
    expect(result).toBe('/custom/inventory-root');
  });
});
