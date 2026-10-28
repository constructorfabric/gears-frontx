// TEST-ONLY — builds the gzipped tar a GitHub tarball endpoint would serve,
// with every entry name chosen by the test rather than by a real repository,
// so a case can carry a key (`../../index.json`, an absolute path, a backslash
// form) that no honest publisher would produce. The bytes go through the REAL
// `createGithubFetchFn` unpacker via its injectable `fetchImpl` seam, so a
// test drives the same acquisition a production `register` does and not a
// hand-built envelope that skips it.
//
// This stays a second tar builder beside `makeGithubTarball` in
// `adapters/__tests__/github-fetch.test.ts` on purpose: that one is private to
// an unrelated test file, wraps every entry in one fixed directory name, writes
// no checksum and cannot hold a name over 100 bytes — and an absolute key built
// from a temporary directory is longer than that. This one carries the pin in
// its wrapper directory, the ustar prefix field, and a refusal for a name it
// cannot encode.
import zlib from 'node:zlib';

const BLOCK = 512;

// ustar holds a name as `prefix` (up to 155 bytes) + "/" + `name` (up to 100
// bytes). Splitting at a "/" that fits both is the only way to carry a long
// absolute key; a name that cannot be split so is refused here, because
// `Buffer.write` would otherwise truncate it without a word and a test would be
// running a different key than the one it names.
function splitUstarName(name: string): { prefix: string; rawName: string } {
  if (Buffer.byteLength(name) <= 100) return { prefix: '', rawName: name };
  for (let index = name.indexOf('/'); index !== -1; index = name.indexOf('/', index + 1)) {
    const prefix = name.slice(0, index);
    const rawName = name.slice(index + 1);
    if (rawName !== '' && Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(rawName) <= 100) return { prefix, rawName };
  }
  throw new Error(`crafted-tarball: ustar cannot hold the entry name ${JSON.stringify(name)}`);
}

function header(name: string, size: number): Buffer {
  const block = Buffer.alloc(BLOCK);
  const { prefix, rawName } = splitUstarName(name);
  block.write(rawName, 0, 100);
  block.write('0000644\0', 100);
  block.write('0000000\0', 108);
  block.write('0000000\0', 116);
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124);
  block.write('00000000000\0', 136);
  block.write('        ', 148);
  block.write('0', 156);
  block.write('ustar\0', 257);
  block.write('00', 263);
  block.write(prefix, 345, 155);
  let checksum = 0;
  for (const byte of block) checksum += byte;
  block.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148);
  return block;
}

export interface CraftedTarball {
  sha: string;
  bytes: Buffer;
}

/**
 * A gzipped tar whose entries are `<acme-tpl-sha>/<key>` for each key of
 * `files`, in insertion order. `sha` becomes the pin the resolver records, so
 * it must be a 7-to-40 character hex string.
 */
export function craftTarball(files: Record<string, string>, sha: string): CraftedTarball {
  const wrapper = `acme-tpl-${sha}`;
  const chunks: Buffer[] = [];
  for (const [key, text] of Object.entries(files)) {
    const body = Buffer.from(text);
    chunks.push(header(`${wrapper}/${key}`, body.length), body, Buffer.alloc((BLOCK - (body.length % BLOCK)) % BLOCK));
  }
  chunks.push(Buffer.alloc(2 * BLOCK));
  return { sha, bytes: zlib.gzipSync(Buffer.concat(chunks)) };
}

/**
 * A `fetch` that serves each tarball under the ref it is keyed by — the `@ref`
 * of a `github:owner/repo@ref` source-spec is the last segment of the tarball
 * URL — and also under its own pinned sha, because a recorded origin is the
 * pinned form and a later re-resolution asks for that. A 404 for any other ref.
 */
export function tarballFetch(tarballs: Record<string, CraftedTarball>): typeof fetch {
  const byRef = new Map<string, Buffer>();
  for (const [ref, tarball] of Object.entries(tarballs)) {
    byRef.set(ref, tarball.bytes);
    byRef.set(tarball.sha, tarball.bytes);
  }
  return (async (url: string | URL | Request) => {
    const bytes = byRef.get(String(url).split('/').pop() ?? '');
    if (bytes === undefined) return new Response('not found', { status: 404, statusText: 'Not Found' });
    return new Response(new Uint8Array(bytes), { status: 200 });
  }) as typeof fetch;
}
