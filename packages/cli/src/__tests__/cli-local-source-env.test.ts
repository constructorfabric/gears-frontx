// TEST-ONLY — exercises the env-gated TEST-ONLY hook in `createRealDeps`
// (`packages/cli/src/cli.ts`) that realizes the EXISTING `FetchFn` seam with
// the local content adapter (`adapters/local-fetch.ts`) when
// `FRONTX_TEST_LOCAL_SOURCE_DIR` is set, so `frontx install` can assemble a
// template OFFLINE. Carries NO `@cpt` marker and traces to NO FEATURE
// instruction — this is test-only infrastructure, not product behavior.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { joinWithinRoot } from '@gears-frontx/test-support/path-guard';
import { createRealDeps } from '../cli';
import { readBundleFiles, isBinaryBundleValue, decodeBundleValue, BUNDLE_MARKER, encodeBundleValue } from '../bundle/envelope';
import { parseSourceSpec } from '../spec-parser/parse';
import { resolveToInventory } from '../resolver/resolve';
import type { FetchFn } from '../resolver/types';

const SEAM_MANIFEST = JSON.stringify({ name: 'fixture', version: '1.0.0', excludedSubtrees: [], description: 'Seam fixture.' });
const TYPED_SPEC = 'github:acme/alpha@v1.0.0';

async function resolveTyped(fetchFn: FetchFn) {
  const parsed = parseSourceSpec(TYPED_SPEC);
  if (!parsed.ok) throw new Error('bad spec');
  return resolveToInventory({ kind: 'remote', ref: parsed.value }, { fetchFn });
}

describe('createRealDeps — TEST-ONLY FRONTX_TEST_LOCAL_SOURCE_DIR hook', () => {
  const originalEnv = process.env.FRONTX_TEST_LOCAL_SOURCE_DIR;
  let localDir: string;

  beforeEach(() => {
    localDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-cli-local-source-'));
  });

  afterEach(() => {
    fs.rmSync(localDir, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.FRONTX_TEST_LOCAL_SOURCE_DIR;
    else process.env.FRONTX_TEST_LOCAL_SOURCE_DIR = originalEnv;
  });

  it('wires the local adapter when the env var is set — fetchFn reads the local directory, ignoring the url', async () => {
    fs.writeFileSync(joinWithinRoot(localDir, 'frontx-template.json'), '{"name":"fixture","version":"1.0.0"}');
    process.env.FRONTX_TEST_LOCAL_SOURCE_DIR = localDir;

    const deps = createRealDeps();
    const fetchOutcome = await deps.fetchFn('https://api.github.com/repos/acme/anything/tarball/v1');
    // `deps.fetchFn` is the real `FetchFn` union (`string | FetchResult`):
    // the local adapter this env var wires in returns a bare string (it has
    // no pin to report), but the STATIC type is the union every `FetchFn`
    // carries, so this narrows the same way `resolve.ts` does rather than
    // assuming the string arm.
    const content = typeof fetchOutcome === 'string' ? fetchOutcome : fetchOutcome.content;

    const files = readBundleFiles(content);
    expect(files).toBeDefined();
    const v = files!['frontx-template.json'];
    expect(isBinaryBundleValue(v)).toBe(true);
    if (isBinaryBundleValue(v)) expect(decodeBundleValue(v)?.toString('utf-8')).toBe('{"name":"fixture","version":"1.0.0"}');
  });

  it('preserves the production GitHub fetchFn when the env var is unset — a bogus url fails the network path, not the local-adapter path', async () => {
    delete process.env.FRONTX_TEST_LOCAL_SOURCE_DIR;

    const deps = createRealDeps();

    // The production `createGithubFetchFn` performs a real network GET; a
    // deliberately unreachable host fails via that HTTP path (fetch
    // rejects/network error), never via the local adapter's
    // "does not exist or is not a directory" error — proving default
    // behavior is unchanged when the test env var is unset.
    await expect(deps.fetchFn('https://this-host-does-not-resolve.invalid.example/x')).rejects.not.toThrow(
      /does not exist or is not a directory/,
    );
  });

  // D1/D2 document the routes outside the pin guarantee: an adapter that
  // reports no pin leaves the typed ref recorded. Flip these if that changes.
  it('D1. the env-wired local adapter records the typed ref, not a commit pin', async () => {
    fs.writeFileSync(joinWithinRoot(localDir, 'frontx-template.json'), SEAM_MANIFEST);
    process.env.FRONTX_TEST_LOCAL_SOURCE_DIR = localDir;

    const resolved = await resolveTyped(createRealDeps().fetchFn);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.value.source).toBe(TYPED_SPEC);
      expect(resolved.value.ref).toBe('v1.0.0');
    }
  });

  it('D2. a bare-string FetchFn records the typed ref, not a commit pin', async () => {
    const content = JSON.stringify({ [BUNDLE_MARKER]: { 'frontx-template.json': encodeBundleValue(Buffer.from(SEAM_MANIFEST)) } });
    const resolved = await resolveTyped(async () => content);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.value.source).toBe(TYPED_SPEC);
      expect(resolved.value.ref).toBe('v1.0.0');
    }
  });
});
