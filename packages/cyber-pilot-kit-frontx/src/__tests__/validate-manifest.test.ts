// @cpt-algo:cpt-frontx-algo-ai-kit-packaging-manifest-validation:p1
import { describe, it, expect } from 'vitest';
import { validateKitManifest } from '../validate-manifest.js';
import type { KitDefinition, KitManifest, KitResourceEntry, ResourceBodyReader } from '../types.js';

function resource(overrides: Partial<KitResourceEntry> = {}): KitResourceEntry {
  return {
    id: 'frontx_skill',
    kind: 'skill',
    source: 'SKILL.md',
    install_path: 'SKILL.md',
    type: 'file',
    user_modifiable: false,
    ...overrides,
  };
}

function validManifest(kitOverrides: Partial<KitDefinition> = {}): KitManifest {
  const kit: KitDefinition = {
    slug: 'cyber-pilot-kit-frontx',
    name: 'FrontX AI Tooling Kit',
    version: '0.3.0-alpha.0',
    resources: [resource()],
    ...kitOverrides,
  };
  return { manifest_version: '1.0', kits: [kit] };
}

describe('validateKitManifest', () => {
  // inst-check-required-fields
  it('missing manifest_version → FAIL required-fields violation', () => {
    const result = validateKitManifest({ kits: [] } as unknown as KitManifest);
    expect(result.status).toBe('FAIL');
    expect(result.violations.some((v) => v.field === 'manifest_version')).toBe(true);
  });

  // inst-check-required-fields — kits array absent
  it('missing kits array → FAIL required-fields violation', () => {
    const result = validateKitManifest({ manifest_version: '1.0' } as unknown as KitManifest);
    expect(result.status).toBe('FAIL');
    expect(result.violations.some((v) => v.field === 'kits')).toBe(true);
  });

  // inst-check-required-fields — kits present but empty
  it('empty kits array → FAIL EMPTY_KITS violation', () => {
    const result = validateKitManifest({ manifest_version: '1.0', kits: [] });
    expect(result.status).toBe('FAIL');
    expect(result.violations.some((v) => v.code === 'EMPTY_KITS')).toBe(true);
  });

  // inst-check-version
  it('missing kit version → FAIL version violation', () => {
    const m = validManifest({ version: '' });
    const result = validateKitManifest(m);
    expect(result.status).toBe('FAIL');
    expect(result.violations.some((v) => v.field === 'kits[0].version')).toBe(true);
  });

  // inst-check-version — slug is the canonical kit identity
  it('missing kit slug → FAIL required-fields violation', () => {
    const m = validManifest({ slug: '' });
    const result = validateKitManifest(m);
    expect(result.status).toBe('FAIL');
    expect(result.violations.some((v) => v.field === 'kits[0].slug')).toBe(true);
  });

  // inst-check-resources-array
  it('empty resources array → FAIL resources-array violation', () => {
    const result = validateKitManifest(validManifest({ resources: [] }));
    expect(result.status).toBe('FAIL');
    expect(result.violations.some((v) => v.field === 'kits[0].resources')).toBe(true);
  });

  // inst-check-entry-required — missing id
  it('resource entry missing id → FAIL entry-required violation', () => {
    const entry = resource();
    delete (entry as Partial<KitResourceEntry>).id;
    const result = validateKitManifest(validManifest({ resources: [entry] }));
    expect(result.status).toBe('FAIL');
    expect(result.violations.some((v) => v.field === 'kits[0].resources[0].id')).toBe(true);
  });

  // inst-check-entry-required — install_path replaces the legacy default_path field
  it('resource entry missing install_path → FAIL entry-required violation', () => {
    const entry = resource();
    delete (entry as Partial<KitResourceEntry>).install_path;
    const result = validateKitManifest(validManifest({ resources: [entry] }));
    expect(result.status).toBe('FAIL');
    expect(result.violations.some((v) => v.field === 'kits[0].resources[0].install_path')).toBe(true);
  });

  // inst-check-frontx-prefix / inst-if-prefix-fail / inst-record-prefix-violation
  it('resource id without frontx_ prefix → FAIL prefix violation', () => {
    const m = validManifest({ resources: [resource({ id: 'skills_main' })] });
    const result = validateKitManifest(m);
    expect(result.status).toBe('FAIL');
    expect(
      result.violations.some((v) => v.field === 'kits[0].resources[0].id' && v.code === 'MISSING_FRONTX_PREFIX'),
    ).toBe(true);
  });

  // inst-check-type-enum
  it('resource type not file or directory → FAIL type-enum violation', () => {
    const m = validManifest({ resources: [resource({ type: 'link' as 'file' })] });
    const result = validateKitManifest(m);
    expect(result.status).toBe('FAIL');
    expect(result.violations.some((v) => v.field === 'kits[0].resources[0].type')).toBe(true);
  });

  // inst-for-each-entry — parity with the Studio engine, which refuses a kit whose
  // source/install_path leaves the kit root (`_validate_install_path`). Without
  // these, validateKitManifest would pass a manifest `cfs` rejects.
  it.each([
    ['install_path', '../../etc/passwd'],
    ['install_path', 'nested/../../escape.md'],
    ['install_path', '/absolute/path.md'],
    ['install_path', '..\\..\\windows.md'],
    ['source', '../outside.md'],
  ])('%s "%s" escaping the kit root → FAIL PATH_ESCAPES_KIT_ROOT', (field, value) => {
    const m = validManifest({ resources: [resource({ [field]: value })] });
    const result = validateKitManifest(m);
    expect(result.status).toBe('FAIL');
    expect(
      result.violations.some(
        (v) => v.code === 'PATH_ESCAPES_KIT_ROOT' && v.field === `kits[0].resources[0].${field}`,
      ),
    ).toBe(true);
  });

  it('install_path in a nested subdirectory that stays inside the kit → PASS', () => {
    const m = validManifest({ resources: [resource({ install_path: 'nested/deep/SKILL.md' })] });
    const result = validateKitManifest(m);
    expect(result.violations).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  // inst-for-each-entry — Studio admits public=true only for skill/agent/rule and
  // raises a hard error otherwise; the validator must not be laxer than the CLI.
  it('public=true on a non-public kind → FAIL PUBLIC_KIND_NOT_ALLOWED', () => {
    const m = validManifest({
      resources: [resource({ id: 'frontx_guidelines', kind: 'directory', type: 'directory', public: true })],
    });
    const result = validateKitManifest(m);
    expect(result.status).toBe('FAIL');
    expect(result.violations.some((v) => v.code === 'PUBLIC_KIND_NOT_ALLOWED')).toBe(true);
  });

  // inst-check-public-kind-restricted — KIT-4 narrows public admission to skill|rule;
  // no bodyReader is passed, so the applicability-metadata check (which requires one) does not fire.
  it.each(['skill', 'rule'])('public=true on kind "%s" (no bodyReader) → PASS', (kind) => {
    const m = validManifest({ resources: [resource({ kind, public: true })] });
    const result = validateKitManifest(m);
    expect(result.violations).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  // inst-check-public-kind-restricted / inst-if-public-kind-restricted-fail / inst-record-public-kind-violation —
  // "agent" is still admitted by the base PUBLIC_KINDS structural check (inst-check-public-kind) but KIT-4
  // narrows public agent-facing entry points in this kit to skill|rule only; the kit declares no agent resource.
  it('public=true on kind "agent" → FAIL PUBLIC_KIND_RESTRICTED', () => {
    const m = validManifest({ resources: [resource({ kind: 'agent', public: true })] });
    const result = validateKitManifest(m);
    expect(result.status).toBe('FAIL');
    expect(result.violations.some((v) => v.code === 'PUBLIC_KIND_RESTRICTED')).toBe(true);
  });

  it('non-boolean public → FAIL INVALID_PUBLIC', () => {
    const m = validManifest({
      resources: [resource({ public: 'true' as unknown as boolean })],
    });
    const result = validateKitManifest(m);
    expect(result.status).toBe('FAIL');
    expect(result.violations.some((v) => v.code === 'INVALID_PUBLIC')).toBe(true);
  });

  it('omitted public on a non-public kind → PASS (the shipped guidelines shape)', () => {
    const m = validManifest({
      resources: [resource({ id: 'frontx_guidelines', kind: 'directory', type: 'directory' })],
    });
    const result = validateKitManifest(m);
    expect(result.violations).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  // inst-scan-solution-content / inst-if-solution-content / inst-record-solution-violation
  it('resource id naming solution-specific concept → FAIL solution-content violation', () => {
    const m = validManifest({ resources: [resource({ id: 'frontx_react_template_skill' })] });
    const result = validateKitManifest(m);
    expect(result.status).toBe('FAIL');
    expect(result.violations.some((v) => v.code === 'SOLUTION_SPECIFIC_CONTENT')).toBe(true);
  });

  // inst-scan-solution-content — naming the vendor toolchain is NOT solution-specific
  // content. "Constructor Studio" is the substrate that installs this kit, not a
  // FrontX solution, so the scan must not flag a description that mentions it.
  it('resource description naming the Constructor Studio toolchain → PASS', () => {
    const m = validManifest({
      resources: [resource({ description: 'Installed by the Constructor Studio CLI (cfs)' })],
    });
    const result = validateKitManifest(m);
    expect(result.violations).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  // inst-check-applicability-metadata / inst-if-applicability-metadata-fail /
  // inst-record-applicability-violation
  it('public resource whose document has no frontmatter description → FAIL MISSING_APPLICABILITY_METADATA', () => {
    const noDescriptionReader: ResourceBodyReader = {
      read(): string[] {
        return ['# FrontX Skill\n\nNo frontmatter here at all.'];
      },
    };
    const m = validManifest({ resources: [resource({ public: true })] });
    const result = validateKitManifest(m, noDescriptionReader);
    expect(result.status).toBe('FAIL');
    expect(result.violations.some((v) => v.code === 'MISSING_APPLICABILITY_METADATA')).toBe(true);
  });

  it('public resource whose frontmatter description is empty → FAIL MISSING_APPLICABILITY_METADATA', () => {
    const emptyDescriptionReader: ResourceBodyReader = {
      read(): string[] {
        return ['---\ndescription: ""\n---\n\n# FrontX Skill'];
      },
    };
    const m = validManifest({ resources: [resource({ public: true })] });
    const result = validateKitManifest(m, emptyDescriptionReader);
    expect(result.status).toBe('FAIL');
    expect(result.violations.some((v) => v.code === 'MISSING_APPLICABILITY_METADATA')).toBe(true);
  });

  it('public resource whose document carries non-empty frontmatter description → PASS', () => {
    const describedReader: ResourceBodyReader = {
      read(): string[] {
        return ['---\ndescription: "Applies when working on FrontX skills."\n---\n\n# FrontX Skill'];
      },
    };
    const m = validManifest({ resources: [resource({ public: true })] });
    const result = validateKitManifest(m, describedReader);
    expect(result.violations).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  it('non-public directory resource without any frontmatter → PASS (metadata only required for public resources)', () => {
    const noFrontmatterReader: ResourceBodyReader = {
      read(): string[] {
        return ['plain guideline content, no frontmatter'];
      },
    };
    const m = validManifest({
      resources: [resource({ id: 'frontx_guidelines', kind: 'directory', type: 'directory' })],
    });
    const result = validateKitManifest(m, noFrontmatterReader);
    expect(result.violations).toEqual([]);
    expect(result.status).toBe('PASS');
  });

  // inst-return-pass
  it('valid manifest with frontx_ prefix → PASS', () => {
    const result = validateKitManifest(validManifest());
    expect(result.status).toBe('PASS');
    expect(result.violations).toHaveLength(0);
  });

  it('multiple valid frontx_ resources → PASS', () => {
    const m = validManifest({
      resources: [
        resource({ id: 'frontx_skill', kind: 'skill', source: 'SKILL.md', install_path: 'SKILL.md' }),
        resource({ id: 'frontx_agents', kind: 'rule', source: 'AGENTS.md', install_path: 'AGENTS.md' }),
        resource({
          id: 'frontx_guidelines',
          kind: 'directory',
          source: 'guidelines/',
          install_path: 'guidelines/',
          type: 'directory',
          user_modifiable: true,
        }),
      ],
    });
    const result = validateKitManifest(m);
    expect(result.status).toBe('PASS');
  });

  // inst-if-violations / inst-return-fail — multiple violations collected
  it('multiple violations → FAIL with all violations reported', () => {
    const m = validManifest({
      resources: [resource({ id: 'bad_id' }), resource({ id: 'also_bad' })],
    });
    const result = validateKitManifest(m);
    expect(result.status).toBe('FAIL');
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });

  // multi-kit documents are valid canonical manifests; violations must be
  // attributed to the kit they came from
  it('violation in the second kit is reported under kits[1]', () => {
    const m: KitManifest = {
      manifest_version: '1.0',
      kits: [
        { slug: 'a', version: '1.0.0', resources: [resource()] },
        { slug: 'b', version: '1.0.0', resources: [resource({ id: 'nope_bad' })] },
      ],
    };
    const result = validateKitManifest(m);
    expect(result.status).toBe('FAIL');
    expect(
      result.violations.some((v) => v.field === 'kits[1].resources[0].id' && v.code === 'MISSING_FRONTX_PREFIX'),
    ).toBe(true);
  });
});
