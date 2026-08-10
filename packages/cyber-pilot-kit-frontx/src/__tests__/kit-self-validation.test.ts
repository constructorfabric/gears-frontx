// @cpt-algo:cpt-frontx-algo-ai-kit-packaging-manifest-validation:p1
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse as parseToml } from 'smol-toml';
import { FORBIDDEN_BODY_NAMES, findForbiddenSolutionName, validateKitManifest } from '../validate-manifest.js';
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

  // Existing on disk is not enough: npm publishes only what `files` covers, so
  // a source outside it leaves the resource declared, validated here, and
  // ABSENT from the published package - the manifest points at nothing on any
  // machine that installed the kit rather than checked out this repository
  // (cpt-frontx-dod-ai-project-scaffolding-declared-skill-surface, clause c).
  // Assumes `files` holds literal paths, which it does: a glob entry would need
  // matching rather than the prefix comparison below, and this kit declares none.
  it('every declared resource source is covered by the package published file set', () => {
    const published = (
      JSON.parse(fs.readFileSync(path.join(kitRoot, 'package.json'), 'utf8')) as { files: string[] }
    ).files.map((entry) => entry.replace(/\/+$/, ''));

    for (const kit of loadShippedManifest().kits) {
      for (const resource of kit.resources) {
        const source = resource.source.replace(/\/+$/, '');
        const covered = published.some((entry) => source === entry || source.startsWith(`${entry}/`));
        expect(covered, `${resource.id}: "${resource.source}" is not covered by package.json "files"`).toBe(true);
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

  // inst-scan-solution-content — regression guard for the CURRENT identities after the
  // issue #470 shell/mfe split. SPECIFIC_TEMPLATE_NAMES keeps the historical
  // `frontx-template-standard`/`template-standard` entries (tested above) AND adds
  // `frontx-template-shell`/`template-shell`/`frontx-template-mfe`/`template-mfe` —
  // a leak naming either current product must be caught exactly like the legacy name.
  it('AGENTS.md-body leak naming the current shell package "frontx-template-shell" → FAIL SOLUTION_SPECIFIC_CONTENT', () => {
    const leakingReader: ResourceBodyReader = {
      read(entry: KitResourceEntry): string[] {
        if (entry.id === 'frontx_agents') {
          return [
            [
              '# FrontX AI Tooling Kit — Agent Navigation Rules',
              '',
              '## Package Boundaries (always enforce)',
              '',
              '- Template packages: `frontx-template-shell` and its sub-packages',
            ].join('\n'),
          ];
        }
        return [''];
      },
    };

    const result = validateKitManifest(loadShippedManifest(), leakingReader);
    expect(result.status).toBe('FAIL');
    expect(
      result.violations.some(
        (v) => v.code === 'SOLUTION_SPECIFIC_CONTENT' && v.message.includes('frontx-template-shell'),
      ),
    ).toBe(true);
  });

  // inst-scan-solution-content — mfe counterpart, bare form (no frontx- prefix)
  it('resource body naming "template-mfe" (without frontx- prefix) → FAIL SOLUTION_SPECIFIC_CONTENT', () => {
    const leakingReader: ResourceBodyReader = {
      read(entry: KitResourceEntry): string[] {
        if (entry.id === 'frontx_guidelines') {
          return ['## Template Territory\n\n`src-app/mfe_packages/` ships from `template-mfe/`.'];
        }
        return [''];
      },
    };
    const result = validateKitManifest(loadShippedManifest(), leakingReader);
    expect(result.status).toBe('FAIL');
    expect(result.violations.some((v) => v.code === 'SOLUTION_SPECIFIC_CONTENT')).toBe(true);
  });

  // inst-scan-solution-content — the FRAMEWORK half of the body scan. Asserting
  // that FORBIDDEN_BODY_NAMES contains the names proves the list; only feeding a
  // body through the scan proves the behaviour. Without this case, dropping
  // FRAMEWORK_NAMES from the scan leaves the whole suite green.
  it.each(['React', 'vue', 'Angular', 'svelte'])(
    'resource body naming the framework "%s" → FAIL SOLUTION_SPECIFIC_CONTENT',
    (framework) => {
      const leakingReader: ResourceBodyReader = {
        read(entry: KitResourceEntry): string[] {
          const body = `Prefer the ${framework} lifecycle for this unit.`;
          return entry.id === 'frontx_guidelines' ? [body] : [''];
        },
      };

      const result = validateKitManifest(loadShippedManifest(), leakingReader);

      expect(result.status).toBe('FAIL');
      expect(
        result.violations.some(
          (v) => v.code === 'SOLUTION_SPECIFIC_CONTENT' && v.message.toLowerCase().includes(framework.toLowerCase()),
        ),
      ).toBe(true);
    },
  );

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

// The two entry points this kit declares for routing and for scaffolding from a
// stated intent (cpt-frontx-dod-ai-project-scaffolding-declared-skill-surface).
// Both are documents rather than modules, so the shipped files ARE the
// implementation and these assertions read them off disk.
describe('kit self-validation — routing and scaffolding entry points (cpt-frontx-dod-ai-project-scaffolding-declared-skill-surface)', () => {
  const SCAFFOLDING_ID = 'frontx_project_scaffolding';
  const ROUTING_ID = 'frontx_skill';

  function resourceById(id: string): KitResourceEntry | undefined {
    return loadShippedManifest().kits.flatMap((kit) => kit.resources).find((r) => r.id === id);
  }

  function shippedBody(id: string): string {
    const resource = resourceById(id);
    if (!resource) throw new Error(`resource "${id}" is not declared in the shipped manifest`);
    return fs.readFileSync(path.join(kitRoot, resource.source), 'utf8');
  }

  it('declares the scaffolding entry point as a public skill under the frontx_ prefix', () => {
    expect(resourceById(SCAFFOLDING_ID)).toMatchObject({
      kind: 'skill',
      public: true,
      type: 'file',
      // Pinned: without it the body assertions below would still pass if the
      // registration pointed at some other document carrying the same commands.
      source: 'skills/project-scaffolding/SKILL.md',
    });
  });

  // The routing responsibility extends the EXISTING top-level resource rather
  // than arriving as a second one: a resource whose only content is a pointer to
  // another adds a hop and no capability, and a second entry claiming the
  // top-level name is not declarable.
  it('carries routing in the existing top-level resource instead of a second top-level entry', () => {
    const topLevel = loadShippedManifest()
      .kits.flatMap((kit) => kit.resources)
      .filter((r) => r.source === 'SKILL.md');

    expect(topLevel.map((r) => r.id)).toEqual([ROUTING_ID]);
  });

  it('states the routing responsibility in a delimited section of the top-level document', () => {
    const body = shippedBody(ROUTING_ID);

    expect(body).toContain('<!-- frontx:routing:begin -->');
    expect(body).toContain('<!-- frontx:routing:end -->');
  });

  // The routing flow's whole point: a request to create a new project resolves
  // to the scaffolding entry point and to nothing else.
  it('routes a request to create a new project to the scaffolding entry point', () => {
    const body = shippedBody(ROUTING_ID);
    const routing = body.slice(
      body.indexOf('<!-- frontx:routing:begin -->'),
      body.indexOf('<!-- frontx:routing:end -->'),
    );

    expect(routing).toContain(SCAFFOLDING_ID);
  });

  // The kit orchestrates the CLI over its command surface and never links it, so
  // the entry point that applies templates must reach them by running the
  // executable (cpt-frontx-dod-ai-project-scaffolding-command-surface-only).
  // The absence of an import specifier is asserted separately, over every
  // shipped document, in no-cli-package-edge.test.ts.
  it('names the executable commands it drives the CLI through, in the scaffolding document', () => {
    const body = shippedBody(SCAFFOLDING_ID);

    expect(body).toContain('frontx list --json');
    expect(body).toContain('frontx seed');
    expect(body).toContain('frontx add');
  });

  // Selection reads the installed set at invocation time; a document that named
  // a template would be a built-in mapping from a request to a product name,
  // which is what the solution-agnostic base forbids.
  //
  // Scanning the document DIRECTLY rather than asserting that the whole-manifest
  // run produced no violation for it: the suite's existing "violations is empty"
  // case already subsumes that assertion, so a per-resource restatement of it
  // can never fail on its own and documents an intent it does not test. Reading
  // the shipped file and applying the production scan makes this case fail by
  // itself the moment this specific document names a product — and it imports
  // that scan rather than transcribing its list, so there is one authority for
  // what is forbidden and no copy here to drift out of step with it.
  it('names no concrete template, solution, or framework in the scaffolding document', () => {
    expect(findForbiddenSolutionName(shippedBody(SCAFFOLDING_ID))).toBeUndefined();
  });

  // Reads the exported list itself, so the scan above is known to be checking a
  // non-empty set of real product names rather than passing because the list
  // emptied out. This is the consumer the list is exported for.
  it('scans against a non-empty forbidden-name list that includes the shipped template identities', () => {
    expect(FORBIDDEN_BODY_NAMES.length).toBeGreaterThan(0);
    expect(FORBIDDEN_BODY_NAMES).toContain('template-shell');
    expect(FORBIDDEN_BODY_NAMES).toContain('react');
  });

  it('names no concrete template, solution, or framework in the routing document', () => {
    expect(findForbiddenSolutionName(shippedBody(ROUTING_ID))).toBeUndefined();
  });

  // The scaffolding flow's verification is accounted for by a checklist shipped
  // beside the skill: the skill holds the mechanics, the checklist holds what
  // those mechanics have to establish, and the report walks its categories.
  // Three things can break that arrangement silently, so each is asserted here.
  describe('verification checklist resource', () => {
    const CHECKLIST_ID = 'frontx_verification_checklist';

    // Studio infers `kind` from a source whose file name ends in `checklist.md`
    // (`_resource_kind_from_path`, studio engine v1.6.2). A rename to any other
    // file name would leave the declared kind and the inferred one disagreeing,
    // which no other assertion in this suite would notice.
    it('is declared as a non-public checklist whose file name backs the kind inference', () => {
      const resource = resourceById(CHECKLIST_ID);

      expect(resource).toMatchObject({
        kind: 'checklist',
        type: 'file',
        source: 'skills/project-scaffolding/verification-checklist.md',
      });
      // Absent rather than false: Studio rejects `public = true` for this kind
      // outright, so the key is left off exactly as it is for frontx_guidelines.
      expect(resource?.public).toBeUndefined();
      expect(resource?.source.endsWith('checklist.md')).toBe(true);
    });

    // The format of record for a Studio checklist: MUST HAVE / MUST NOT HAVE
    // partitions, and every item carrying a severity from the document's own
    // dictionary. An item added without one reads as unprioritized and gives a
    // report no basis for deciding whether a failure blocks.
    it('partitions into MUST HAVE / MUST NOT HAVE and gives every item a declared severity', () => {
      const body = shippedBody(CHECKLIST_ID);

      expect(body).toContain('\n# MUST HAVE\n');
      expect(body).toContain('\n# MUST NOT HAVE\n');

      const items = [...body.matchAll(/^### (VER-[A-Z-]*\d{3}): .+\n\*\*Severity\*\*: (\w+)$/gm)];
      const headings = [...body.matchAll(/^### (VER-[A-Z-]*\d{3}):/gm)];

      // Every item heading matched the stricter pattern, so none is missing the
      // severity line that has to sit directly under it.
      expect(items.length).toBe(headings.length);
      expect(items.length).toBeGreaterThan(0);
      for (const [, id, severity] of items) {
        expect(['CRITICAL', 'HIGH', 'MEDIUM'], `${id} carries severity "${severity}"`).toContain(severity);
      }
    });

    // The wiring is what makes the checklist load-bearing rather than a file
    // nobody opens: Step 7 names it as the browser walk's definition of done,
    // and Step 8 requires the per-category status walk over it.
    it('is named by the scaffolding document as the walk definition of done and as the report status walk', () => {
      const body = shippedBody(SCAFFOLDING_ID);

      expect(body).toContain('verification-checklist.md');
      expect(body).toContain(CHECKLIST_ID);
      expect(body).toContain('per-category status walk');
    });
  });

  // The theme walk's mechanics ship twice over: as prose in the scaffolding
  // document, and as a program that performs them. The prose copy did not
  // survive a change of agent host, which is the whole reason the program
  // exists, so the wiring that makes it reachable and runnable is asserted here.
  describe('verification driver resource', () => {
    const DRIVER_ID = 'frontx_verify_walk';
    const DRIVER_SOURCE = 'skills/project-scaffolding/scripts/verify-walk.mjs';
    const driverPath = () => path.join(kitRoot, DRIVER_SOURCE);

    it('is declared as a non-public script resource at the path the skill names', () => {
      const resource = resourceById(DRIVER_ID);

      expect(resource).toMatchObject({ kind: 'script', type: 'file', source: DRIVER_SOURCE });
      // Absent rather than false, exactly as for the checklist: Studio rejects
      // `public = true` outside the skill/agent/rule kinds outright.
      expect(resource?.public).toBeUndefined();
    });

    it('ships as an executable node program', () => {
      expect(fs.readFileSync(driverPath(), 'utf8').startsWith('#!/usr/bin/env node')).toBe(true);
    });

    // Without this, the driver could ship, validate and still be reached by
    // nobody: the document is the only thing that sends a run to it.
    it('is named by the scaffolding document as what the theme walk runs, with hand-driving as the fallback', () => {
      const body = shippedBody(SCAFFOLDING_ID);

      expect(body).toContain(DRIVER_ID);
      expect(body).toContain(DRIVER_SOURCE);
      expect(body).toContain('Hand-authored browser calls are the fallback');
    });

    it('prints its flag surface and exits 0 on --help', () => {
      const help = spawnSync(process.execPath, [driverPath(), '--help'], { encoding: 'utf8' });

      expect(help.status).toBe(0);
      expect(help.stdout).toContain('--capdir');
      expect(help.stdout).toContain('--themes');
    });

    // The failure path is the one that matters: a driver that exits 0 on a run
    // it could not perform hands back a pass nobody established. Against an
    // origin nothing serves, it must refuse before a browser is involved, and
    // the refusal must be readable by machine.
    it('exits non-zero with a well-formed JSON failure record when nothing serves the host', () => {
      const capdir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-walk-'));
      fs.rmdirSync(capdir); // the driver creates it, and refuses one that already holds files

      const run = spawnSync(process.execPath, [
        driverPath(),
        '--host', 'http://127.0.0.1:1',
        '--themes', 'light,dark',
        '--screens', 'orders:/orders:screen-orders',
        '--capdir', capdir,
        '--switcher', 'theme-switcher',
        '--theme-option', 'theme-option-{theme}',
        '--menu', 'nav-{screen}',
      ], { encoding: 'utf8' });

      expect(run.status).not.toBe(0);

      const parsed = JSON.parse(run.stdout) as {
        ok: boolean;
        themeSet: { source: string; themes: string[] };
        failures: { stage: string; detail: string }[];
      };
      expect(parsed.ok).toBe(false);
      expect(parsed.failures[0].stage).toBe('host-probe');
      // The set's provenance is recorded, so a report cannot claim a hand-typed
      // set was read out of the host's theme registration.
      expect(parsed.themeSet).toEqual({ source: 'literal', themes: ['light', 'dark'] });
      // Written to disk as well as printed: the run's own record survives the
      // conversation that produced it.
      expect(JSON.parse(fs.readFileSync(path.join(capdir, 'verify-walk.json'), 'utf8')).ok).toBe(false);

      fs.rmSync(capdir, { recursive: true, force: true });
    });
  });
});
