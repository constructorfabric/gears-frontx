/**
 * MFE Handler — re-exported from @gears-frontx/mfes (Phase 8 extraction).
 *
 * MfeHandlerMF and LruCache now live in @gears-frontx/mfes.
 * This file retains test-only legacy remoteEntry.js parsing utilities
 * that depend on MfeHandlerMF private methods via TypeScript unsound casts.
 */
export { MfeHandlerMF, LruCache } from '@gears-frontx/mfes';

import { MfeHandlerMF } from '@gears-frontx/mfes';

// ---------------------------------------------------------------------------
// Test-only exports (remoteEntry / chunk parsing — not used by MF2 manifest path)
// ---------------------------------------------------------------------------

const __mfParseHandler = new MfeHandlerMF(
  'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~'
);

/** @internal Unit tests */
export function parseStaticImportFilenamesFromChunk(
  source: string,
  chunkFilename: string
): string[] {
  return (
    __mfParseHandler as unknown as {
      parseStaticImportFilenames(s: string, f: string): string[];
    }
  ).parseStaticImportFilenames(source, chunkFilename);
}

export type ExposeMetadataFromRemoteEntry = {
  chunkFilename: string;
  stylesheetPaths: string[];
};

function findMatchingBrace(source: string, openIndex: number): number {
  if (source.charAt(openIndex) !== '{') return -1;
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    const ch = source.charAt(i);
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findMatchingParen(source: string, openIndex: number): number {
  if (source.charAt(openIndex) !== '(') return -1;
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    const ch = source.charAt(i);
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Match the literal `:()=>` arrow-function signature, allowing arbitrary
 * whitespace between tokens. Linear scan avoids the ReDoS lint flag that
 * fires on regex sources containing repeated `\s*` quantifiers (even when,
 * as here, the pattern is anchored and not actually backtracking-prone).
 */
function matchExposeSignature(suffix: string): number {
  const literals = [':', '(', ')', '=>'];
  let cursor = 0;
  for (const literal of literals) {
    while (cursor < suffix.length && /\s/.test(suffix.charAt(cursor))) {
      cursor += 1;
    }
    if (suffix.slice(cursor, cursor + literal.length) !== literal) {
      return -1;
    }
    cursor += literal.length;
  }
  return cursor;
}

function parseQuotedStringsInBrackets(inner: string): string[] {
  const out: string[] = [];
  const re = /'([^']*)'|"([^"]*)"/g;
  for (let m = re.exec(inner); m !== null; m = re.exec(inner)) {
    out.push(m[1] || m[2] || '');
  }
  return out;
}

function extractStylesheetPathsFromExposeBody(body: string): string[] {
  const dyn = /dynamicLoadingCss\s*\(\s*\[([^\]]*)\]/.exec(body);
  if (dyn) {
    return parseQuotedStringsInBrackets(dyn[1] || '');
  }
  const min = /\bE\s*\(\s*\[([^\]]*)\]/.exec(body);
  if (min) {
    return parseQuotedStringsInBrackets(min[1] || '');
  }
  return [];
}

function extractChunkFilenameFromExposeBody(body: string): string | null {
  const fed = /__federation_import\s*\(\s*['"]\.\/([^'"]+)['"]\s*\)/.exec(body);
  if (fed?.[1]) return fed[1];
  const w = /\bw\s*\(\s*['"]\.\/([^'"]+)['"]\s*\)/.exec(body);
  if (w?.[1]) return w[1];
  return null;
}

/** @internal Unit tests — legacy remoteEntry.js expose map parsing */
export function parseExposeMetadataFromRemoteEntry(
  source: string,
  exposedModule: string
): ExposeMetadataFromRemoteEntry | null {
  const keyToken = JSON.stringify(exposedModule);
  let searchFrom = 0;
  let rest: string | undefined;
  while (rest === undefined) {
    const keyIdx = source.indexOf(keyToken, searchFrom);
    if (keyIdx < 0) return null;
    const suffix = source.slice(keyIdx + keyToken.length);
    const sigEnd = matchExposeSignature(suffix);
    if (sigEnd >= 0) {
      rest = suffix.slice(sigEnd).trimStart();
      break;
    }
    searchFrom = keyIdx + 1;
  }
  let body: string;
  if (rest.startsWith('{')) {
    const close = findMatchingBrace(rest, 0);
    if (close < 0) return null;
    body = rest.slice(1, close);
  } else if (rest.startsWith('(')) {
    const close = findMatchingParen(rest, 0);
    if (close < 0) return null;
    body = rest.slice(1, close);
  } else {
    return null;
  }

  const stylesheetPaths = extractStylesheetPathsFromExposeBody(body);
  const chunkFilename = extractChunkFilenameFromExposeBody(body);
  if (!chunkFilename) {
    return null;
  }
  return { chunkFilename, stylesheetPaths };
}
