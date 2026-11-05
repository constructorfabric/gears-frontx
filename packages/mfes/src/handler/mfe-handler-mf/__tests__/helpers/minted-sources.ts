/**
 * Minted-source capture for `mfe-handler-mf` test suites.
 *
 * `URL.createObjectURL` is the single choke point every minted module
 * passes through (expose chunks and shared units alike), so spying on it
 * recovers the source texts the browser would evaluate. The real
 * implementation still runs, so the handler keeps genuine `blob:` URLs.
 */
import { vi } from 'vitest';

export interface MintedSources {
  /** Every minted source text, in minting order. */
  sources(): Promise<string[]>;
  restore(): void;
}

/** Start capturing minted sources; call `restore()` when done. */
export function captureMintedSources(): MintedSources {
  const blobs: Blob[] = [];
  const original = URL.createObjectURL.bind(URL);
  const spy = vi
    .spyOn(URL, 'createObjectURL')
    .mockImplementation((object: Blob | MediaSource) => {
      if (object instanceof Blob) blobs.push(object);
      return original(object);
    });
  // jsdom's Blob has no `text()`, so the text comes back through FileReader.
  const readAsText = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error('read failed'));
      reader.readAsText(blob);
    });
  return {
    sources: () => Promise.all(blobs.map(readAsText)),
    restore: () => spy.mockRestore(),
  };
}

/**
 * Every `from "x"` / `import "x"` specifier in `source` that is not an
 * inline-content URL minted by the load — a bare specifier left
 * unrewritten, which an isolated module graph cannot resolve.
 */
export function unmintedSpecifiers(source: string): string[] {
  const found: string[] = [];
  const pattern = /(?:^|[^.\w$])(?:from|import)\s*(['"])([^'"]+)\1/g;
  for (const match of source.matchAll(pattern)) {
    const specifier = match[2];
    if (!specifier.startsWith('blob:') && !specifier.startsWith('data:')) {
      found.push(specifier);
    }
  }
  return found;
}
