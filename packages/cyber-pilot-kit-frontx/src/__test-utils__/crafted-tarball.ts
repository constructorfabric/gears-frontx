// TEST-ONLY — builds the gzipped tar a GitHub tarball endpoint would serve,
// with every entry name chosen by the test rather than by a real repository,
// so a case can carry a key (`../../index.json`, an absolute path, a backslash
// form) that no honest publisher would produce. The bytes go through the REAL
// `createGithubFetchFn` unpacker via its injectable `fetchImpl` seam, so a
// test drives the same acquisition a production `register` does and not a
// hand-built envelope that skips it.
//
// Every archive it builds is one the strict unpacker accepts as GitHub-shaped:
// a global PAX header stating the commit, a root directory entry, valid header
// checksums and the end-of-archive marker. The low-level `tarHeader`,
// `paxBody` and `tarEntry` let a test break exactly one of those rules.
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

/** One 512-byte ustar header with a valid checksum. */
export function tarHeader(name: string, size: number, typeflag = '0'): Buffer {
  const block = Buffer.alloc(BLOCK);
  const { prefix, rawName } = splitUstarName(name);
  block.write(rawName, 0, 100);
  block.write('0000644\0', 100);
  block.write('0000000\0', 108);
  block.write('0000000\0', 116);
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124);
  block.write('00000000000\0', 136);
  block.write(typeflag, 156, 1, 'latin1');
  block.write('ustar\0', 257);
  block.write('00', 263);
  block.write(prefix, 345, 155);
  return withChecksum(block);
}

/** Rewrites the checksum field of `block` (in place) to match its bytes. */
export function withChecksum(block: Buffer): Buffer {
  block.write('        ', 148);
  let checksum = 0;
  for (const byte of block) checksum += byte;
  block.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148);
  return block;
}

/** PAX records with correct byte-counted lengths. */
export function paxBody(records: Array<[string, string]>): Buffer {
  return Buffer.concat(
    records.map(([key, value]) => {
      const rest = ` ${key}=${value}\n`;
      let length = Buffer.byteLength(rest) + 1;
      while (String(length).length + Buffer.byteLength(rest) !== length) length++;
      return Buffer.from(`${length}${rest}`);
    }),
  );
}

/** Header plus body padded to the block size. */
export function tarEntry(name: string, body: Buffer | string = '', typeflag = '0'): Buffer {
  const bytes = Buffer.from(body);
  return Buffer.concat([tarHeader(name, bytes.length, typeflag), bytes, Buffer.alloc((BLOCK - (bytes.length % BLOCK)) % BLOCK)]);
}

export const END_OF_ARCHIVE = Buffer.alloc(2 * BLOCK);

export interface CraftedTarball {
  sha: string;
  bytes: Buffer;
}

/**
 * A gzipped GitHub-shaped tar: a global PAX header stating `sha`, the root
 * directory `acme-tpl-<sha[0..7]>/`, then `<root>/<key>` for each key of
 * `files`, in insertion order. `sha` is the pin the resolver records, so it
 * must be a lowercase 40-hex commit.
 */
export function craftTarball(files: Record<string, string>, sha: string): CraftedTarball {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`crafted-tarball: ${JSON.stringify(sha)} is not a 40-hex commit`);
  const wrapper = `acme-tpl-${sha.slice(0, 7)}`;
  const chunks: Buffer[] = [
    tarEntry('pax_global_header', paxBody([['comment', sha]]), 'g'),
    tarEntry(`${wrapper}/`, '', '5'),
  ];
  for (const [key, text] of Object.entries(files)) chunks.push(tarEntry(`${wrapper}/${key}`, text));
  chunks.push(END_OF_ARCHIVE);
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
