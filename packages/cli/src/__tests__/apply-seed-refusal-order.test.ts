// @cpt-flow:cpt-frontx-flow-cli-scaffolding-add-template:p1
// @cpt-flow:cpt-frontx-flow-cli-scaffolding-seed-repository:p1
//
// Refusal precedence when an AI-bundle replacement review would also refuse.
// `apply` step 2 decides REGISTRATION_CONFLICT "before any origin is resolved",
// and `seed` step 3 refuses an already-seeded directory before every later
// step; the replacement review resolves origins, so it must come after both.
// Each case pairs the combined state with a control that shows the review is
// armed (it answers CONFIRMATION_REQUIRED once the earlier refusal is absent).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run, createRealDeps } from '../cli';

vi.mock('../generated/official-defaults', () => ({
  OFFICIAL_DEFAULT_TEMPLATES: { '@example/alpha': 'path:tpl-alpha' },
}));

// Explicit, non-recursive cleanup of exactly what each test writes.
let sandbox: string;
const files: string[] = [];
const dirs = new Set<string>();
const originalCwd = process.cwd();
let originalInventoryRoot: string | undefined;

function put(rel: string, content: string): void {
  const file = path.join(sandbox, rel);
  for (let dir = path.dirname(file); dir !== sandbox; dir = path.dirname(dir)) dirs.add(dir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  files.push(file);
}
const read = (rel: string): string => fs.readFileSync(path.join(sandbox, rel), 'utf8');
const manifest = (name: string): string => JSON.stringify({ name, version: '1.0.0', excludedSubtrees: [], description: 'Fixture.' });

beforeEach(() => {
  sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-refusal-order-')));
  originalInventoryRoot = process.env.FRONTX_INVENTORY_ROOT;
  process.env.FRONTX_INVENTORY_ROOT = path.join(sandbox, 'inventory');
});

afterEach(() => {
  process.chdir(originalCwd);
  if (originalInventoryRoot === undefined) delete process.env.FRONTX_INVENTORY_ROOT;
  else process.env.FRONTX_INVENTORY_ROOT = originalInventoryRoot;
  for (const file of files.splice(0)) {
    try { fs.unlinkSync(file); } catch { /* already absent */ }
  }
  for (const dir of [...dirs].sort((a, b) => b.length - a.length)) {
    try { fs.rmdirSync(dir); } catch { /* absent or not empty: left for inspection */ }
  }
  dirs.clear();
  try { fs.rmdirSync(sandbox); } catch { /* not empty: left for inspection */ }
});

async function invoke(argv: string[]): Promise<{ exitCode: number; code: string | undefined }> {
  const outcome = await run([...argv, '--json'], createRealDeps());
  const envelope = JSON.parse(outcome.stdout ?? '') as { ok: boolean; error?: { code: string } };
  return { exitCode: outcome.exitCode, code: envelope.error?.code };
}

describe('apply: REGISTRATION_CONFLICT precedes the AI replacement review', () => {
  const state = JSON.stringify({
    formatVersion: 1,
    templates: {
      '@x/a': { origin: 'path:tpl-a', version: '1.0.0', targets: [] },
      '@x/a/b': { origin: 'path:tpl-b', version: '1.0.0', targets: [] },
    },
    projectOwnedRoots: [],
  });

  beforeEach(() => {
    put('proj/.frontx/project.json', state);
    // An existing bundle the candidate of `@x/a` would replace: the review refuses unapproved.
    put('proj/.frontx/ai/@x/a/local.md', 'local edit');
    put('proj/tpl-a/frontx-template.json', manifest('@x/a'));
    put('proj/tpl-a/.frontx/ai/@x/a/guide.md', 'guide');
    put('proj/tpl-b/frontx-template.json', manifest('@x/a/b'));
    put('proj/tpl-b/.frontx/ai/@x/a/b/guide.md', 'nested guide');
    process.chdir(path.join(sandbox, 'proj'));
  });

  it('a batch naming both nesting names is refused REGISTRATION_CONFLICT, writing nothing', async () => {
    const result = await invoke(['apply', '--input', JSON.stringify({ templates: { '@x/a': ['a'], '@x/a/b': ['b'] } })]);
    expect(result).toEqual({ exitCode: 1, code: 'REGISTRATION_CONFLICT' });
    expect(read('proj/.frontx/project.json')).toBe(state);
    expect(read('proj/.frontx/ai/@x/a/local.md')).toBe('local edit');
    expect(fs.existsSync(path.join(sandbox, 'proj/a'))).toBe(false);
  });

  it('control: without the overlapping partner in the batch the review answers CONFIRMATION_REQUIRED', async () => {
    const result = await invoke(['apply', '--input', JSON.stringify({ templates: { '@x/a': ['a'] } })]);
    expect(result).toEqual({ exitCode: 1, code: 'CONFIRMATION_REQUIRED' });
    expect(read('proj/.frontx/ai/@x/a/local.md')).toBe('local edit');
  });
});

describe('seed: an already-seeded directory is refused before the AI replacement review', () => {
  const batch = JSON.stringify({ templates: { '@example/alpha': ['.'] } });

  beforeEach(() => {
    put('dir/.frontx/ai/@example/alpha/local.md', 'local edit');
    put('dir/tpl-alpha/frontx-template.json', manifest('@example/alpha'));
    put('dir/tpl-alpha/.frontx/ai/@example/alpha/guide.md', 'guide');
  });

  it('refuses INVALID_INPUT for a seeded directory, writing nothing', async () => {
    put('dir/.frontx/project.json', '{"formatVersion":1,"templates":{},"projectOwnedRoots":[]}');
    const result = await invoke(['seed', path.join(sandbox, 'dir'), '--input', batch]);
    expect(result).toEqual({ exitCode: 1, code: 'INVALID_INPUT' });
    expect(read('dir/.frontx/ai/@example/alpha/local.md')).toBe('local edit');
  });

  it('control: an unseeded directory gets the review, CONFIRMATION_REQUIRED, and no state document', async () => {
    const result = await invoke(['seed', path.join(sandbox, 'dir'), '--input', batch]);
    expect(result).toEqual({ exitCode: 1, code: 'CONFIRMATION_REQUIRED' });
    expect(fs.existsSync(path.join(sandbox, 'dir/.frontx/project.json'))).toBe(false);
  });
});
