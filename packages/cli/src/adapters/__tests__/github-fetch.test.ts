// @cpt-algo:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1
// @cpt-algo:cpt-frontx-algo-template-resolution-bounded-update:p1
// @cpt-dod:cpt-frontx-dod-template-resolution-install-by-spec:p1
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, it, expect, vi } from 'vitest';
import { MAX_EXPANDED_BYTES, createGithubFetchFn, resolveInventoryRoot } from '../github-fetch';
import { parseSourceSpec } from '../../spec-parser/parse';
import { resolveToInventory } from '../../resolver/resolve';
import { isBinaryBundleValue, decodeBundleValue, readBundleFiles } from '../../bundle/envelope';
import { END_OF_ARCHIVE, paxBody, tarEntry, tarHeader, withChecksum } from '../../__tests__/support/crafted-tarball';

const COMMIT = 'a7f7dabaf336bda98d2166848af15d9168b10bcf';
const ROOT = 'acme-my-template-a7f7dab';
const URL_TYPED = 'https://api.github.com/repos/acme/my-template/tarball/v1.0.0';
const TOKEN = 'SECRET-T';
const MANIFEST = JSON.stringify({
  name: 'acme-widgets',
  version: '1.0.0',
  excludedSubtrees: [],
  description: 'Fixture template for GitHub fetch tests.',
});

const globalHeader = (records: Array<[string, string]> = [['comment', COMMIT]]): Buffer =>
  tarEntry('pax_global_header', paxBody(records), 'g');
const perFile = (records: Array<[string, string]>): Buffer => tarEntry('PaxHeaders/x', paxBody(records), 'x');
const rootDir = (root = ROOT): Buffer => tarEntry(`${root}/`, '', '5');

/** A GitHub-shaped archive (before gzip): global comment, root dir, files. */
function makeGithubTarball(files: Record<string, string>, root = ROOT, comment = COMMIT): Buffer {
  return Buffer.concat([
    globalHeader([['comment', comment]]),
    rootDir(root),
    ...Object.entries(files).map(([relative, text]) => tarEntry(`${root}/${relative}`, text)),
    END_OF_ARCHIVE,
  ]);
}

const serve = (tar: Buffer) =>
  vi.fn(async () => new Response(new Uint8Array(zlib.gzipSync(tar)), { status: 200, statusText: 'OK' })) as unknown as typeof fetch;

async function fetchTar(tar: Buffer, url = URL_TYPED) {
  const result = await createGithubFetchFn({ fetchImpl: serve(tar), token: TOKEN })(url);
  if (typeof result === 'string') throw new Error('expected a FetchResult');
  return result;
}

async function expectRefused(tar: Buffer, pattern?: RegExp): Promise<void> {
  const error = await fetchTar(tar).then(
    () => undefined,
    (err: unknown) => err as Error,
  );
  expect(error, 'archive was accepted').toBeInstanceOf(Error);
  expect(error!.message).toContain(URL_TYPED);
  expect(error!.message).not.toContain(TOKEN);
  if (pattern) expect(error!.message).toMatch(pattern);
}

const fileText = (content: string, key: string): string | undefined => {
  const value = readBundleFiles(content)?.[key];
  return isBinaryBundleValue(value) ? decodeBundleValue(value)?.toString('utf-8') : undefined;
};

async function resolveSpec(spec: string, tar: Buffer) {
  const parsed = parseSourceSpec(spec);
  if (!parsed.ok) throw new Error(`bad spec ${spec}`);
  return resolveToInventory({ kind: 'remote', ref: parsed.value }, { fetchFn: createGithubFetchFn({ fetchImpl: serve(tar) }) });
}

describe('createGithubFetchFn', () => {
  it('(a) fetches, unpacks and resolves the bundle; the pin is the PAX commit, not the typed ref', async () => {
    const fetchImpl = serve(makeGithubTarball({ 'frontx-template.json': MANIFEST, 'src/index.ts': 'export {};' }));
    const parsed = parseSourceSpec('github:acme/my-template@v1.0.0');
    if (!parsed.ok) throw new Error('bad spec');
    const resolved = await resolveToInventory({ kind: 'remote', ref: parsed.value }, { fetchFn: createGithubFetchFn({ fetchImpl }) });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(fileText(resolved.value.content, 'frontx-template.json')).toBe(MANIFEST);
    expect(fileText(resolved.value.content, 'src/index.ts')).toBe('export {};');
    expect(resolved.value.name).toBe('acme-widgets');
    expect(resolved.value.source).toBe(`github:acme/my-template@${COMMIT}`);
    // The fetch addresses the TYPED ref; the pin does not exist until it returns.
    expect(fetchImpl).toHaveBeenCalledWith(URL_TYPED, expect.objectContaining({ headers: expect.any(Object) }));
  });

  it('(d) rejects when the response body is not valid gzip data', async () => {
    const fetchImpl = vi.fn(async () => new Response('not-gzip-bytes', { status: 200 })) as unknown as typeof fetch;
    await expect(createGithubFetchFn({ fetchImpl })(URL_TYPED)).rejects.toThrow(/not valid gzip data/);
  });

  it('(b) rejects on a non-OK status, and the resolver reports a fetch failure', async () => {
    const fetchImpl = vi.fn(async () => new Response('not found', { status: 404, statusText: 'Not Found' })) as unknown as typeof fetch;
    const fetchFn = createGithubFetchFn({ fetchImpl });
    await expect(fetchFn('https://api.github.com/repos/acme/missing/tarball/v1.0.0')).rejects.toThrow(/404/);
    const parsed = parseSourceSpec('github:acme/missing@v1.0.0');
    if (!parsed.ok) throw new Error('bad spec');
    const resolved = await resolveToInventory({ kind: 'remote', ref: parsed.value }, { fetchFn });
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.error.message).toContain('Failed to fetch template from registry');
  });

  it('(c) attaches an Authorization header when a token is supplied', async () => {
    const fetchImpl = serve(makeGithubTarball({ 'a.txt': 'a' }));
    await createGithubFetchFn({ fetchImpl, token: 'abc123' })(URL_TYPED);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer abc123' }) }),
    );
  });

  describe('accepts', () => {
    it('A1. branch-like typed ref: pin = comment', async () => {
      const resolved = await resolveSpec('github:acme/my-template@main', makeGithubTarball({ 'frontx-template.json': MANIFEST }));
      expect(resolved.ok && resolved.value.source).toBe(`github:acme/my-template@${COMMIT}`);
    });

    it.each(['A7F7DAB', 'a7F7dAb', COMMIT.toUpperCase()])('A2. typed %s: pin = lowercase comment', async (typed) => {
      const resolved = await resolveSpec(`github:acme/my-template@${typed}`, makeGithubTarball({ 'frontx-template.json': MANIFEST }));
      expect(resolved.ok && resolved.value.source).toBe(`github:acme/my-template@${COMMIT}`);
    });

    it('A3. annotated-tag shape: root carries the tag object, pin = comment', async () => {
      const commit = 'ba9a4473850cb367936417e97f1f2191b7cc67dd';
      const resolved = await resolveSpec(
        'github:acme/my-template@v5.0.0',
        makeGithubTarball({ 'frontx-template.json': MANIFEST }, 'acme-my-template-2103b41', commit),
      );
      expect(resolved.ok && resolved.value.source).toBe(`github:acme/my-template@${commit}`);
    });

    it('(f) owner and repository segments containing hyphens', async () => {
      const result = await fetchTar(makeGithubTarball({ 'a.txt': 'a' }, 'ac-me-my-templ-ate-a7f7dab'));
      expect(result.pinnedRef).toBe(COMMIT);
    });

    it('A4. a long name carried only by `x path` materializes at the effective path', async () => {
      const long = `${'d'.repeat(120)}/${'f'.repeat(120)}.txt`;
      const result = await fetchTar(
        Buffer.concat([globalHeader(), rootDir(), perFile([['path', `${ROOT}/${long}`]]), tarEntry(`${ROOT}/truncated`, 'long'), END_OF_ARCHIVE]),
      );
      expect(fileText(result.content, long)).toBe('long');
      expect(fileText(result.content, 'truncated')).toBeUndefined();
    });

    it('A5. a Unicode `x path` whose byte length differs from its character length', async () => {
      const name = 'docs/привет-мир.md';
      const result = await fetchTar(
        Buffer.concat([globalHeader(), rootDir(), perFile([['path', `${ROOT}/${name}`], ['mtime', '1']]), tarEntry(`${ROOT}/x`, 'hi'), END_OF_ARCHIVE]),
      );
      expect(fileText(result.content, name)).toBe('hi');
    });

    it('A6. directory and symlink entries with `x` headers are not materialized; the symlink is reported', async () => {
      const result = await fetchTar(
        Buffer.concat([
          globalHeader(),
          rootDir(),
          perFile([['path', `${ROOT}/dir/`]]),
          tarEntry('ignored/', '', '5'),
          perFile([['linkpath', 'target']]),
          tarEntry(`${ROOT}/link`, '', '2'),
          tarEntry(`${ROOT}/dir/a.txt`, 'a'),
          END_OF_ARCHIVE,
        ]),
      );
      expect(Object.keys(readBundleFiles(result.content) ?? {})).toEqual(['dir/a.txt']);
      expect(result.symlinks).toEqual(['link']);
    });

    it('A7. GitHub shape: comment, root dir, subdirectory, files', async () => {
      const result = await fetchTar(
        Buffer.concat([globalHeader(), rootDir('acme-tpl-abc1234'), tarEntry('acme-tpl-abc1234/src/', '', '5'), tarEntry('acme-tpl-abc1234/src/a.ts', 'a'), END_OF_ARCHIVE]),
      );
      expect(result.pinnedRef).toBe(COMMIT);
      expect(fileText(result.content, 'src/a.ts')).toBe('a');
    });

    it('A7b. a root directory entry is optional', async () => {
      const result = await fetchTar(Buffer.concat([globalHeader(), tarEntry(`${ROOT}/a.txt`, 'a'), END_OF_ARCHIVE]));
      expect(result.pinnedRef).toBe(COMMIT);
    });

    it('A8. hex-looking typed name whose commit differs: pin = comment', async () => {
      const commit = '1'.repeat(40);
      const resolved = await resolveSpec('github:acme/my-template@abc1234', makeGithubTarball({ 'frontx-template.json': MANIFEST }, 'acme-my-template-abc1234', commit));
      expect(resolved.ok && resolved.value.source).toBe(`github:acme/my-template@${commit}`);
    });

    it('A9. typed 40-hex tag-object-like selector with a different comment: pin = comment', async () => {
      const commit = '1'.repeat(40);
      const resolved = await resolveSpec(
        'github:acme/my-template@abcdef0123456789012345678901234567890123',
        makeGithubTarball({ 'frontx-template.json': MANIFEST }, 'acme-my-template-abcdef0', commit),
      );
      expect(resolved.ok && resolved.value.source).toBe(`github:acme/my-template@${commit}`);
    });

    it('A10. a symlink outside the selected subtree is accepted and not materialized', async () => {
      const resolved = await resolveSpec(
        'github:acme/my-template//shell@main',
        Buffer.concat([
          globalHeader(),
          rootDir(),
          tarEntry(`${ROOT}/other/link`, '', '2'),
          tarEntry(`${ROOT}/shell/frontx-template.json`, MANIFEST),
          END_OF_ARCHIVE,
        ]),
      );
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;
      expect(resolved.value.source).toBe(`github:acme/my-template//shell@${COMMIT}`);
      expect(Object.keys(readBundleFiles(resolved.value.content) ?? {})).toEqual(['frontx-template.json']);
    });
  });

  describe('refuses (message names the URL, never the token)', () => {
    const file = tarEntry(`${ROOT}/a.txt`, 'a');
    const archive = (...entries: Buffer[]): Buffer => Buffer.concat([...entries, END_OF_ARCHIVE]);

    it('B3. no global header', () => expectRefused(archive(rootDir(), file), /no global PAX header/));
    it('B4. global header without comment', () => expectRefused(archive(tarEntry('g', Buffer.alloc(0), 'g'), file)));
    it('B5. two global headers', () => expectRefused(archive(globalHeader(), globalHeader(), file)));
    it('B6. global header after the first entry', () => expectRefused(archive(file, globalHeader())));
    it('B7. global header with an extra key', () =>
      expectRefused(archive(globalHeader([['comment', COMMIT], ['other', 'x']]), file), /global PAX key/));
    it.each([COMMIT.slice(1), `${COMMIT}0`, COMMIT.toUpperCase(), `${COMMIT.slice(1)}g`, 'a'.repeat(64)])(
      'B8. comment %s',
      (comment) => expectRefused(archive(globalHeader([['comment', comment]]), file)),
    );

    const rawGlobal = (body: string | Buffer) => archive(tarEntry('g', body, 'g'), file);
    const record = (body: string) => rawGlobal(body);
    // `52 comment=<40 hex>\n` is exactly 52 bytes.
    it('B9. control: the well-formed record is accepted', async () => {
      expect((await fetchTar(record(`52 comment=${COMMIT}\n`))).pinnedRef).toBe(COMMIT);
    });
    it.each([
      ['length one short', `51 comment=${COMMIT}\n`, /PAX record/],
      ['length one long', `53 comment=${COMMIT}\n`, /PAX record/],
      ['leading zero', `052 comment=${COMMIT}\n`, /record length/],
      ['7-digit length', `1000000 comment=x\n`, /record length/],
      ['missing =', `52 comment ${COMMIT}\n`, /record key/],
      ['empty key', `13 =abcdefgh\n`, /record key/],
      ['missing final newline', `52 comment=${COMMIT} `, /PAX record/],
      ['garbage after the last record', `52 comment=${COMMIT}\nxx`, /record length/],
      ['truncated body', `60 comment=${COMMIT}\n`, /PAX record/],
      ['repeated key', `52 comment=${COMMIT}\n52 comment=${COMMIT}\n`, /repeats/],
    ])('B9. PAX framing: %s', (_label, body, reason) => expectRefused(record(body), reason));

    it('B9. a Unicode value whose declared length counts characters, not bytes', () =>
      expectRefused(archive(globalHeader(), tarEntry('x', '15 path=привет\n', 'x'), file), /PAX record/));
    it('B9. a value that is not valid UTF-8', () =>
      expectRefused(archive(globalHeader(), tarEntry('x', Buffer.concat([Buffer.from('11 path='), Buffer.from([0xff, 0xff, 0x0a])]), 'x'), file), /UTF-8/));

    it('B10. `x path` changing the root', () =>
      expectRefused(archive(globalHeader(), file, perFile([['path', 'other-root-abc1234/b.txt']]), tarEntry(`${ROOT}/b.txt`, 'b')), /more than one root/));
    it('B11. two entries colliding on effective path, one via override', () =>
      expectRefused(archive(globalHeader(), file, perFile([['path', `${ROOT}/a.txt`]]), tarEntry(`${ROOT}/b.txt`, 'b')), /two entries/));
    it('B12. `x` with size', () => expectRefused(archive(globalHeader(), perFile([['size', '1']]), file), /per-file PAX key "size"/));
    it('B13. `x` with an unknown key', () => expectRefused(archive(globalHeader(), perFile([['uname', 'me']]), file)));
    it('B14. consecutive `x`', () => expectRefused(archive(globalHeader(), perFile([]), perFile([]), file)));
    it('B15. trailing `x`', () => expectRefused(archive(globalHeader(), file, perFile([]))));
    it.each(['1', 'L', 'K', '3', '4', '6', '7', 'Z'])('B16. typeflag %s', (flag) =>
      expectRefused(archive(globalHeader(), tarEntry(`${ROOT}/odd`, '', flag), file), /unsupported entry type/));
    it.each([
      ['an absolute directory', '/abs/', '5'],
      ['a climbing directory', `${ROOT}/../x/`, '5'],
      ['a climbing symlink', `${ROOT}/../link`, '2'],
      ['a symlink name with NUL', `${ROOT}/a\0b`, '2'],
    ])('B17. unsafe effective name: %s', (_label, name, flag) =>
      expectRefused(archive(globalHeader(), perFile([['path', name]]), tarEntry('n', '', flag), file), /unsafe entry name|root/));
    it('B17. an absolute file name has no root', () => expectRefused(archive(globalHeader(), perFile([['path', '/abs/a.txt']]), file), /root/));
    it.each([`${ROOT}/../a.txt`, `${ROOT}/src/../../a.txt`, `${ROOT}/a\0b.txt`])(
      'B17. a file key %j is refused by the shared resolver with INVALID_PATH (bundle-key validity)',
      async (name) => {
        const resolved = await resolveSpec(
          'github:acme/my-template@main',
          archive(globalHeader(), tarEntry(`${ROOT}/frontx-template.json`, MANIFEST), perFile([['path', name]]), tarEntry('n', 'x')),
        );
        expect(resolved.ok).toBe(false);
        if (!resolved.ok) expect(resolved.error.code).toBe('INVALID_PATH');
      },
    );
    it('B18. no root', () => expectRefused(archive(globalHeader(), tarEntry('a.txt', 'a')), /root/));
    it.each(['acme-my-template-abc123', 'acme-my-template-abcxyz1'])('B19. root %s', (root) =>
      expectRefused(archive(globalHeader(), tarEntry(`${root}/a.txt`, 'a')), /root/));
    it('B20. a file entry whose path is the root', () => expectRefused(archive(globalHeader(), rootDir(), tarEntry(ROOT, 'x'), file), /no path below the root/));
    it('B21. a second root directory entry', () => expectRefused(archive(globalHeader(), rootDir(), rootDir(), file)));
    it('B21. a directory entry that names the root but is not the first such', () =>
      expectRefused(archive(globalHeader(), tarEntry(ROOT, '', '5'), tarEntry(`${ROOT}/`, '', '5'), file)));

    const good = (): Buffer => makeGithubTarball({ 'a.txt': 'a' });
    it('B23. one header byte flipped', () => {
      const tar = good();
      tar[1024 + 5] ^= 1;
      return expectRefused(tar, /checksum/);
    });
    it.each([['non-octal', '00009999\0'], ['overlong', '00000000'], ['blank', '        ']])('B24. checksum field %s', (_label, field) => {
      const tar = good();
      tar.write(field, 1024 + 148, 'latin1');
      return expectRefused(tar, /checksum/);
    });
    it.each([['digit 8', '00000000008\0'], ['digit 9', '00000000009\0'], ['sign', '-0000000001\0'], ['leading blank', ' 0000000001\0']])(
      'B25. size field with %s',
      (_label, field) => {
        const tar = good();
        tar.write(field, 1024 + 124, 'latin1');
        withChecksum(tar.subarray(1024, 1536));
        return expectRefused(tar, /entry size/);
      },
    );
    it('B25. size field with GNU base-256 encoding', () => {
      const tar = good();
      tar.fill(0, 1024 + 124, 1024 + 136);
      tar[1024 + 124] = 0x80;
      tar[1024 + 135] = 1;
      withChecksum(tar.subarray(1024, 1536));
      return expectRefused(tar, /entry size/);
    });
    it('B26. declared size beyond the buffer', () =>
      expectRefused(Buffer.concat([globalHeader(), tarHeader(`${ROOT}/a.txt`, 4096)]), /truncated/));
    it('B26. padding cut short', () => expectRefused(Buffer.concat([globalHeader(), tarHeader(`${ROOT}/a.txt`, 1), Buffer.from('a')]), /truncated/));
    it('B27. buffer ends mid-header', () => expectRefused(Buffer.concat([globalHeader(), file.subarray(0, 300)]), /end-of-archive/));
    it('B28. no end-of-archive zero blocks', () => expectRefused(Buffer.concat([globalHeader(), file]), /end-of-archive/));
    it('B29. a single zero block at the very end', () =>
      expectRefused(Buffer.concat([globalHeader(), file, Buffer.alloc(512)]), /end-of-archive/));
    it('B30. non-zero bytes after the end-of-archive marker', () =>
      expectRefused(Buffer.concat([globalHeader(), file, END_OF_ARCHIVE, Buffer.from('x')]), /end-of-archive/));
  });

  describe('resource limits (refuse before unbounded allocation)', () => {
    const tar = makeGithubTarball({ 'frontx-template.json': MANIFEST });
    const gz = zlib.gzipSync(tar);
    const fetchGz = (bytes: Buffer, limits: { maxArchiveBytes?: number; maxExpandedBytes?: number }) => {
      const fetchImpl = vi.fn(async () => new Response(new Uint8Array(bytes), { status: 200 })) as unknown as typeof fetch;
      return createGithubFetchFn({ fetchImpl, token: TOKEN, ...limits })(URL_TYPED);
    };
    /** A body stream that counts how many chunks were pulled from it. */
    const countingStream = (chunk: Uint8Array, chunks = Infinity) => {
      const state = { pulls: 0, cancelled: false };
      const stream = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            if (state.pulls++ >= chunks) controller.close();
            else controller.enqueue(chunk);
          },
          cancel() {
            state.cancelled = true;
          },
        },
        { highWaterMark: 0 },
      );
      return { state, stream };
    };

    it('L1. accepts an archive exactly at the archive cap, refuses one byte under', async () => {
      await expect(fetchGz(gz, { maxArchiveBytes: gz.length })).resolves.toMatchObject({ pinnedRef: COMMIT });
      await expect(fetchGz(gz, { maxArchiveBytes: gz.length - 1 })).rejects.toThrow(
        new RegExp(`exceeds the ${gz.length - 1}-byte archive limit`),
      );
    });

    it('L2. refuses a declared Content-Length over the cap without reading the body', async () => {
      const { state, stream } = countingStream(new Uint8Array(1024));
      const fetchImpl = vi.fn(
        async () => new Response(stream, { status: 200, headers: { 'content-length': '2048' } }),
      ) as unknown as typeof fetch;
      const error = await createGithubFetchFn({ fetchImpl, token: TOKEN, maxArchiveBytes: 1024 })(URL_TYPED).catch((e: Error) => e);
      expect((error as Error).message).toMatch(/archive limit/);
      expect((error as Error).message).toContain(URL_TYPED);
      expect((error as Error).message).not.toContain(TOKEN);
      expect(state.pulls).toBe(0);
    });

    it('L3. stops reading an endless body without Content-Length once over the cap, and cancels it', async () => {
      const { state, stream } = countingStream(new Uint8Array(1024));
      const fetchImpl = vi.fn(async () => new Response(stream, { status: 200 })) as unknown as typeof fetch;
      await expect(createGithubFetchFn({ fetchImpl, maxArchiveBytes: 4096 })(URL_TYPED)).rejects.toThrow(/archive limit/);
      expect(state.pulls).toBeLessThanOrEqual(6);
      expect(state.cancelled).toBe(true);
    });

    it('L4. accepts a tar that expands exactly to the expanded cap, refuses one byte under', async () => {
      await expect(fetchGz(gz, { maxExpandedBytes: tar.length })).resolves.toMatchObject({ pinnedRef: COMMIT });
      await expect(fetchGz(gz, { maxExpandedBytes: tar.length - 1 })).rejects.toThrow(
        new RegExp(`expands past the ${tar.length - 1}-byte limit`),
      );
    });

    it('L5. refuses a gzip bomb under the default caps: a small body expanding past MAX_EXPANDED_BYTES', async () => {
      // gunzip concatenates members, so 257 copies of a 1 MiB-of-zeros member
      // is a ~260 KB body that expands to 257 MiB.
      const member = zlib.gzipSync(Buffer.alloc(1024 * 1024), { level: 9 });
      const bomb = Buffer.concat(Array.from({ length: MAX_EXPANDED_BYTES / (1024 * 1024) + 1 }, () => member));
      expect(bomb.length).toBeLessThan(1024 * 1024);
      const error = await fetchGz(bomb, {}).catch((e: Error) => e);
      expect((error as Error).message).toMatch(new RegExp(`expands past the ${MAX_EXPANDED_BYTES}-byte limit`));
      expect((error as Error).message).toContain(URL_TYPED);
      expect((error as Error).message).not.toContain(TOKEN);
    });
  });

  describe('symlink scope (resolver)', () => {
    it.each([
      ['inside the selected subtree', 'github:acme/my-template//shell@main', `${ROOT}/shell/link`],
      ['the selected subtree itself', 'github:acme/my-template//shell@main', `${ROOT}/shell`],
      ['anywhere when there is no subtree', 'github:acme/my-template@main', `${ROOT}/other/link`],
    ])('B22. refuses a symlink %s', async (_label, spec, link) => {
      const resolved = await resolveSpec(
        spec,
        Buffer.concat([globalHeader(), rootDir(), tarEntry(link, '', '2'), tarEntry(`${ROOT}/shell/frontx-template.json`, MANIFEST), tarEntry(`${ROOT}/frontx-template.json`, MANIFEST), END_OF_ARCHIVE]),
      );
      expect(resolved.ok).toBe(false);
      if (resolved.ok) return;
      expect(resolved.error.code).toBeUndefined();
      expect(resolved.error.message).toMatch(/symlink/);
    });
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
