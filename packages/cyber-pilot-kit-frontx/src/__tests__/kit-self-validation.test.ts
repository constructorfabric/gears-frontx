// @cpt-algo:cpt-frontx-algo-ai-kit-packaging-manifest-validation:p1
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseToml } from 'smol-toml';
import { validateKitManifest } from '../validate-manifest.js';
import { createFsResourceBodyReader } from '../resource-body-reader.js';
import type { KitManifest, KitResourceEntry, ResourceBodyReader } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Kit package root: src/__tests__/ -> src/ -> package root
const kitRoot = path.resolve(__dirname, '../..');
const manifestPath = path.join(kitRoot, '.cf-studio-kit.toml');

// The manifest under test is the REAL shipped file, parsed from disk — not a
// literal transcribed by hand. A hardcoded copy cannot detect the manifest
// drifting away from what this validator accepts, and previously did not:
// the file could be deleted outright with the whole suite still green.
//
// Loaded lazily inside each test rather than at module scope: an import-time
// read would abort collection of the whole file on a missing or malformed
// manifest, so the existence assertion below could never run and report it.
let cachedManifest: KitManifest | undefined;
function loadShippedManifest(): KitManifest {
  cachedManifest ??= parseToml(fs.readFileSync(manifestPath, 'utf8')) as unknown as KitManifest;
  return cachedManifest;
}

// cpt-frontx-adr-ai-tooling-framework-packaging mandates a check asserting that
// every resource identifier in the shipped manifest matches ^frontx_ (KIT-1).
// The ADR claimed this existed; it did not. These assertions are that check,
// and they read the real file rather than a transcription of it.
describe('shipped manifest on disk — canonical shape and KIT-1 prefix', () => {
  it('.cf-studio-kit.toml exists and parses as TOML', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const shippedManifest = loadShippedManifest();
    expect(shippedManifest.manifest_version).toBe('1.0');
    expect(Array.isArray(shippedManifest.kits)).toBe(true);
    expect(shippedManifest.kits.length).toBeGreaterThan(0);
  });

  it('legacy Cypilot manifest.toml is gone', () => {
    expect(fs.existsSync(path.join(kitRoot, 'manifest.toml'))).toBe(false);
  });

  it('every resource id in the shipped manifest matches ^frontx_ (KIT-1)', () => {
    const ids = loadShippedManifest().kits.flatMap((kit) => kit.resources.map((r) => r.id));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(id).toMatch(/^frontx_/);
    }
  });

  it('manifest version matches package.json version', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(kitRoot, 'package.json'), 'utf8')) as { version: string };
    expect(loadShippedManifest().kits[0].version).toBe(pkg.version);
  });

  it('core.toml registration version matches the shipped manifest', () => {
    const corePath = path.resolve(kitRoot, '../../.cf-studio/config/core.toml');
    const core = parseToml(fs.readFileSync(corePath, 'utf8')) as unknown as {
      kits: Record<string, { version: string }>;
    };
    const registration = core.kits['cyber-pilot-kit-frontx'];
    expect(registration).toBeDefined();
    expect(registration.version).toBe(loadShippedManifest().kits[0].version);
  });

  it('every declared resource source exists on disk', () => {
    for (const kit of loadShippedManifest().kits) {
      for (const resource of kit.resources) {
        expect(fs.existsSync(path.join(kitRoot, resource.source))).toBe(true);
      }
    }
  });

  it('the real shipped manifest passes validateKitManifest', () => {
    const result = validateKitManifest(loadShippedManifest());
    expect(result.violations).toEqual([]);
    expect(result.status).toBe('PASS');
  });
});

describe('kit self-validation — shipped resource BODY scan (cpt-frontx-adr-solution-ai-content-placement)', () => {
  // inst-scan-solution-content — real on-disk shipped content, no bodyReader (baseline, id/description only)
  it('manifest id/description-only scan (no bodyReader) → PASS on shipped manifest', () => {
    const result = validateKitManifest(loadShippedManifest());
    expect(result.status).toBe('PASS');
  });

  // inst-scan-solution-content — proves the body scan reads real shipped files and finds no leak
  it('real shipped AGENTS.md / SKILL.md / guidelines/* bodies contain no specific template/solution name → PASS', () => {
    const reader = createFsResourceBodyReader(kitRoot);
    const result = validateKitManifest(loadShippedManifest(), reader);
    expect(result.status).toBe('PASS');
    expect(result.violations).toHaveLength(0);
  });

  // inst-scan-solution-content / inst-if-solution-content / inst-record-solution-violation —
  // regression test for the fixed ADR-0026 violation: AGENTS.md previously shipped with a body
  // naming `frontx-template-standard`; manifest id/description alone never caught this.
  it('AGENTS.md-body leak naming a specific template → FAIL SOLUTION_SPECIFIC_CONTENT (caught by body scan, not by id/description scan)', () => {
    const leakingReader: ResourceBodyReader = {
      read(entry: KitResourceEntry): string[] {
        if (entry.id === 'frontx_agents') {
          return [
            [
              '# FrontX AI Tooling Kit — Agent Navigation Rules',
              '',
              '## Package Boundaries (always enforce)',
              '',
              '- Template packages: `frontx-template-standard` and its sub-packages',
            ].join('\n'),
          ];
        }
        return [''];
      },
    };

    // Sanity: the manifest-metadata-only scan does NOT catch this leak (id/description are clean).
    const metadataOnly = validateKitManifest(loadShippedManifest());
    expect(metadataOnly.status).toBe('PASS');

    // The body scan MUST catch it.
    const result = validateKitManifest(loadShippedManifest(), leakingReader);
    expect(result.status).toBe('FAIL');
    expect(
      result.violations.some(
        (v) => v.code === 'SOLUTION_SPECIFIC_CONTENT' && v.message.includes('frontx-template-standard'),
      ),
    ).toBe(true);
  });

  // inst-scan-solution-content — the other explicitly-named leak case (bare "template-standard")
  it('resource body naming "template-standard" (without frontx- prefix) → FAIL SOLUTION_SPECIFIC_CONTENT', () => {
    const leakingReader: ResourceBodyReader = {
      read(entry: KitResourceEntry): string[] {
        if (entry.id === 'frontx_guidelines') {
          return ['## Template Territory\n\n`packages/template-standard/` is template territory.'];
        }
        return [''];
      },
    };
    const result = validateKitManifest(loadShippedManifest(), leakingReader);
    expect(result.status).toBe('FAIL');
    expect(result.violations.some((v) => v.code === 'SOLUTION_SPECIFIC_CONTENT')).toBe(true);
  });

  // inst-scan-solution-content — abstract use of the generic word "template" in guidelines is NOT a false positive
  it('body abstractly describing the template mechanism (no specific name) → PASS', () => {
    const abstractReader: ResourceBodyReader = {
      read(entry: KitResourceEntry): string[] {
        const body = 'Templates are independently installed solutions the CLI resolves by source-spec; the base names none.';
        // Public resources (frontx_skill, frontx_agents) must still carry applicability
        // metadata for this scenario to isolate the solution-content scan being tested.
        return entry.public ? [`---\ndescription: "test fixture"\n---\n\n${body}`] : [body];
      },
    };
    const result = validateKitManifest(loadShippedManifest(), abstractReader);
    expect(result.status).toBe('PASS');
  });

  // inst-scan-solution-content — unreadable resource body is reported as a violation, not silently ignored
  it('unreadable resource body → FAIL RESOURCE_BODY_UNREADABLE', () => {
    const throwingReader: ResourceBodyReader = {
      read(): string[] {
        throw new Error('ENOENT: no such file');
      },
    };
    const result = validateKitManifest(loadShippedManifest(), throwingReader);
    expect(result.status).toBe('FAIL');
    expect(result.violations.some((v) => v.code === 'RESOURCE_BODY_UNREADABLE')).toBe(true);
  });
});

// The kit's own test suite asserting its declared-resource-surface DoD clauses
// (a)-(c) against the REAL shipped manifest and resource files on disk, per the
// DoD's own verifiable clause (d) and cpt-frontx-adr-ai-tooling-framework-packaging Confirmation.
// Traceability marker for this DoD lives in validate-manifest.ts, the production
// code that enforces it (test files are excluded from marker scanning).
describe('kit self-validation — declared public resource surface (cpt-frontx-dod-ai-kit-packaging-declared-resource-surface)', () => {
  const publicResources = () => loadShippedManifest().kits.flatMap((kit) => kit.resources.filter((r) => r.public === true));
  const nonPublicResources = () => loadShippedManifest().kits.flatMap((kit) => kit.resources.filter((r) => r.public !== true));

  // DoD clause (a): every public resource is kind skill|rule
  it('every public resource has kind "skill" or "rule"', () => {
    expect(publicResources().length).toBeGreaterThan(0);
    for (const resource of publicResources()) {
      expect(['skill', 'rule']).toContain(resource.kind);
    }
  });

  // DoD clause (b): each public resource document carries non-empty applicability
  // metadata (frontmatter description) — read the real shipped file, not a mock.
  it('every public resource document carries a non-empty frontmatter description', () => {
    for (const resource of publicResources()) {
      const body = fs.readFileSync(path.join(kitRoot, resource.source), 'utf8');
      const frontmatter = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      expect(frontmatter, `${resource.id}: expected frontmatter in ${resource.source}`).not.toBeNull();
      const description = frontmatter?.[1].match(/^description:\s*(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
      expect(description, `${resource.id}: expected non-empty frontmatter description`).toBeTruthy();
    }
  });

  // DoD clause (c): supporting knowledge content (frontx_guidelines) ships as a
  // declared non-public resource, not as an undeclared public entry point.
  it('frontx_guidelines is declared and is not public', () => {
    const guidelines = nonPublicResources().find((r) => r.id === 'frontx_guidelines');
    expect(guidelines).toBeDefined();
    expect(guidelines?.public).not.toBe(true);
  });

  // DoD clause (d): validateKitManifest itself asserts (a) and (b) via the real
  // fs body reader, over the real shipped manifest — end-to-end, not mocked.
  it('validateKitManifest PASSes clauses (a) and (b) against the real shipped manifest and files', () => {
    const reader = createFsResourceBodyReader(kitRoot);
    const result = validateKitManifest(loadShippedManifest(), reader);
    expect(result.violations).toEqual([]);
    expect(result.status).toBe('PASS');
  });
});
