#!/usr/bin/env node

/**
 * Prints a dist entry file and every dist file it reaches through relative
 * static imports and re-exports, one absolute path per line.
 *
 * The ESM build preserves modules (one dist file per source module, see
 * buildPlugin.ts's getBuildConfig): dist/<name>.js re-exports the component's
 * modules under dist/chunks/. verify-consumer.sh uses this to look for a probe
 * in what an entry ships, not in the entry file alone.
 *
 * Usage: node scripts/dist-entry-closure.mjs <dist entry file>
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const RELATIVE_IMPORT =
  /(?:^|[\s;}])(?:import|export)\s[^'"]*?from\s*["'](\.{1,2}\/[^"']+)["']|(?:^|[\s;])import\s*["'](\.{1,2}\/[^"']+\.js)["']/gm;

const entry = process.argv[2];
if (entry === undefined) {
  console.error('usage: dist-entry-closure.mjs <dist entry file>');
  process.exit(2);
}
const seen = new Set();
const pending = [path.resolve(entry)];
while (pending.length > 0) {
  const file = pending.pop();
  if (seen.has(file) || !existsSync(file)) continue;
  seen.add(file);
  for (const match of readFileSync(file, 'utf8').matchAll(RELATIVE_IMPORT)) {
    pending.push(path.resolve(path.dirname(file), match[1] ?? match[2]));
  }
}
console.log([...seen].join('\n'));
