// @cpt-algo:cpt-frontx-algo-template-resolution-parse-spec:p1
// @cpt-dod:cpt-frontx-dod-template-resolution-spec-parser-rejection:p1
import { describe, it, expect } from 'vitest';
import { parseSourceSpec } from '../spec-parser/parse.js';

describe('parseSourceSpec', () => {
  // cpt-frontx-algo-template-resolution-parse-spec: happy path
  it('valid host:owner/repo@ref parses to { host, owner, repo, ref }', () => {
    // inst-parse-prefix-check, inst-parse-extract-host, inst-parse-at-check,
    // inst-parse-extract-repo, inst-parse-extract-ref, inst-parse-return
    const result = parseSourceSpec('github:acme/my-template@v1.2.0');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      host: 'github',
      owner: 'acme',
      repo: 'my-template',
      ref: 'v1.2.0',
    });
  });

  // inst-parse-no-prefix, inst-parse-no-prefix-fail
  it('missing host: prefix rejected before any fetch', () => {
    const result = parseSourceSpec('acme/my-template@v1.2.0');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/host/i);
  });

  // inst-parse-no-at, inst-parse-no-at-fail
  it('missing @ref selector rejected before any fetch', () => {
    const result = parseSourceSpec('github:acme/my-template');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/@ref|version|selector/i);
  });

  // descriptive error messages
  it('parse error message is descriptive', () => {
    const noPrefix = parseSourceSpec('owner/repo@ref');
    expect(noPrefix.ok).toBe(false);
    if (noPrefix.ok) return;
    expect(noPrefix.error.message.length).toBeGreaterThan(10);

    const noRef = parseSourceSpec('github:owner/repo');
    expect(noRef.ok).toBe(false);
    if (noRef.ok) return;
    expect(noRef.error.message.length).toBeGreaterThan(10);
  });
});
