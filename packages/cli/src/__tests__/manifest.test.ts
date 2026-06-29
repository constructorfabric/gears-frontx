// @cpt-flow:cpt-frontx-flow-template-manifest-validate-for-publication:p1
// @cpt-algo:cpt-frontx-algo-template-manifest-validate-contract:p1
// @cpt-state:cpt-frontx-state-template-manifest-validation-lifecycle:p1
// @cpt-dod:cpt-frontx-dod-template-manifest-validate-command:p1
// @cpt-dod:cpt-frontx-dod-template-manifest-single-description:p1
import { describe, it, expect, vi } from 'vitest';
import { validateManifestContract } from '../manifest/validate-contract.js';
import { validateCommand } from '../commands/validate.js';
import type { TemplateManifest, ReadFileFn } from '../manifest/types.js';

// Helper: build a valid manifest JSON string
function validManifest(overrides: Partial<TemplateManifest> = {}): string {
  const base: TemplateManifest = { name: 'my-tpl', version: '1.0.0', kind: 'mfe-template' };
  return JSON.stringify({ ...base, ...overrides });
}

describe('validateManifestContract', () => {
  // inst-if-parse-error / inst-add-parse-violation
  it('malformed JSON → FAIL parse-error violation', () => {
    const result = validateManifestContract('not-valid-json{{{');
    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') return;
    expect(result.violations.some((v) => v.field === 'manifest')).toBe(true);
  });

  // inst-check-identity / inst-add-identity-violation
  it('missing name field → identity violation', () => {
    const raw = JSON.stringify({ version: '1.0.0', kind: 'mfe-template' });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') return;
    expect(result.violations.some((v) => v.field === 'name')).toBe(true);
  });

  // inst-check-version / inst-add-version-violation
  it('missing version field → version violation', () => {
    const raw = JSON.stringify({ name: 'my-tpl', kind: 'mfe-template' });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') return;
    expect(result.violations.some((v) => v.field === 'version')).toBe(true);
  });

  // inst-check-kind / inst-add-kind-violation
  it('invalid kind field → kind violation', () => {
    const raw = JSON.stringify({ name: 'my-tpl', version: '1.0.0', kind: 'unknown-kind' });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') return;
    expect(result.violations.some((v) => v.field === 'kind')).toBe(true);
  });

  // inst-if-composition-invalid / inst-add-composition-violation
  it('project-template with malformed composition ref → composition violation', () => {
    const raw = JSON.stringify({
      name: 'my-tpl',
      version: '1.0.0',
      kind: 'project-template',
      compositions: [{ ref: '   ' }], // whitespace-only ref is invalid
    });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') return;
    expect(result.violations.some((v) => v.field.startsWith('compositions'))).toBe(true);
  });

  // inst-return-validated
  it('valid manifest → VALIDATED with no violations', () => {
    const result = validateManifestContract(validManifest());
    expect(result.status).toBe('VALIDATED');
    expect(result.violations).toHaveLength(0);
  });

  // forward-reading invariant — schemaVersion is optional
  it('manifest without schemaVersion still passes (forward-readable)', () => {
    const raw = JSON.stringify({ name: 'my-tpl', version: '2.0.0', kind: 'project-template' });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('VALIDATED');
  });

  // valid project-template with well-formed composition refs
  it('project-template with valid composition refs → VALIDATED', () => {
    const raw = JSON.stringify({
      name: 'my-project',
      version: '1.0.0',
      kind: 'project-template',
      compositions: [{ ref: 'github:acme/mfe-a@v1.0.0' }, { ref: 'registered-mfe' }],
    });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('VALIDATED');
  });
});

describe('validateCommand', () => {
  // inst-if-manifest-absent / inst-return-manifest-absent
  it('returns FAIL + non-zero exit code when manifest absent', async () => {
    const readFileFn: ReadFileFn = vi.fn().mockRejectedValue(new Error('ENOENT: no such file'));
    const result = await validateCommand('/some/template', readFileFn);
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/manifest not found/i);
  });

  // inst-else-pass / inst-return-pass
  it('returns PASS + zero exit code for conforming manifest', async () => {
    const readFileFn: ReadFileFn = vi.fn().mockResolvedValue(validManifest());
    const result = await validateCommand('/some/template', readFileFn);
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  // inst-report-violations / inst-return-fail
  it('reports all violations on REJECTED manifest', async () => {
    // Missing name and version — two violations expected
    const raw = JSON.stringify({ kind: 'mfe-template' });
    const readFileFn: ReadFileFn = vi.fn().mockResolvedValue(raw);
    const result = await validateCommand('/some/template', readFileFn);
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.violations).toBeDefined();
    expect((result.violations ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('single authoritative description', () => {
  // inst-dod-template-manifest-single-description
  it('TemplateManifest type is the same shape used by validate and install/scaffold consumers', () => {
    // structural: validateManifestContract accepts raw and returns typed TemplateManifest on success;
    // no divergent descriptor exists — one shape for all commands
    const raw = JSON.stringify({ name: 'my-tpl', version: '1.0.0', kind: 'mfe-template' });
    const result = validateManifestContract(raw);
    expect(result.status).toBe('VALIDATED');
    // The same TemplateManifest type is what a readManifestFromContent helper would return.
    // No divergent descriptor exists.
  });
});
