// @cpt-algo:cpt-frontx-algo-ai-kit-packaging-manifest-validation:p1
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
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

// Every spawnSync below drives the real driver, which drives a browser command
// of its own. Without a bound here, a driver that stops returning does not fail
// this suite - it holds CI open until the job is killed, and the suite reports
// nothing about why.
//
// Strictly above the driver's own default --command-timeout (60000ms), and
// deliberately not equal to it: at equal budgets a driver correctly killing a
// stuck child races the parent killing the driver, and the run that loses that
// race reports a hung driver where the driver was doing its job. A timeout at
// this level therefore means the driver itself hung rather than a child it was
// already bounding.
const DRIVER_TIMEOUT_MS = 120_000;

// Handed to every stub-driven run below, so no such run leans on the driver's
// 60000ms default and every one of them is bounded well inside the parent bound
// above. A test that needs the kill to happen sooner passes its own value after
// these, and the later flag is the one the driver reads.
const STUB_COMMAND_TIMEOUT_MS = '15000';

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
      const help = spawnSync(process.execPath, [driverPath(), '--help'], {
        encoding: 'utf8',
        timeout: DRIVER_TIMEOUT_MS,
      });

      expect(help.status).toBe(0);
      expect(help.stdout).toContain('--capdir');
      expect(help.stdout).toContain('--themes');
      // The Usage line carries every required flag. One that lists a flag as
      // required and leaves it out of the invocation form teaches the shorter
      // form, and the shorter form is refused.
      const usage = help.stdout.slice(help.stdout.indexOf('Usage:'), help.stdout.indexOf('Required:'));
      for (const flag of ['--host', '--themes', '--screens', '--capdir', '--switcher', '--theme-option']) {
        expect(usage, `Usage: omits the required ${flag}`).toContain(flag);
      }
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
      ], { encoding: 'utf8', timeout: DRIVER_TIMEOUT_MS });

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

    // The runner evaluates every script in one persistent page scope, so the
    // prelude is re-entered on each call rather than once per run. Declared
    // lexically, its helpers throw "already been declared" from the second eval
    // onward, and the callers read that throw as an element holding nothing:
    // three agent hosts driven from identical sources each reported empty theme
    // labels on every theme rather than the redeclaration underneath.
    it('installs its page helpers as globals, so evaluating the prelude twice in one scope does not throw', () => {
      const source = fs.readFileSync(driverPath(), 'utf8');
      const preludeMatch = /const PRELUDE = `([\s\S]*?)`;/.exec(source);
      if (preludeMatch === null) throw new Error('the driver no longer carries a PRELUDE template literal');

      // What reaches the page is the interpolated prelude, so the sentinel's
      // substitution is resolved here from the driver's own declaration of it -
      // running the raw literal would be running a text no page ever sees. Any
      // other substitution stops this test rather than being evaluated broken.
      const sentinelMatch = /^const MISSING = ('[^']*');$/m.exec(source);
      if (sentinelMatch === null) throw new Error('the driver no longer declares MISSING as a single-quoted literal');
      const prelude = preludeMatch[1].replaceAll('${JSON.stringify(MISSING)}', sentinelMatch[1]);
      if (prelude.includes('${')) throw new Error('the prelude carries a substitution this test cannot resolve');

      // Column zero is the prelude's own top level; the indented declarations
      // are inside the helper bodies, where a fresh scope makes them safe.
      expect(prelude).not.toMatch(/^(?:const|let|class)\b/m);

      const context = vm.createContext({});
      vm.runInContext(prelude, context);

      expect(() => vm.runInContext(prelude, context)).not.toThrow();
      expect(vm.runInContext('typeof __find', context)).toBe('function');
      expect(vm.runInContext('__MISSING', context)).toBe('__verify_walk_missing__');
    });

    // The value the prelude installs into the page and the value the read check
    // compares a reading against are the same claim, and they were written out
    // as two literals. Changing one alone left the check comparing against a
    // string the page never returns, which reads as an absent control passing a
    // `read` action. One spelling in the whole file is what keeps them together.
    it('spells the missing-element sentinel exactly once, so the prelude and the read check cannot drift', () => {
      const source = fs.readFileSync(driverPath(), 'utf8');
      const spellings = source.match(/__verify_walk_missing__/g) ?? [];

      expect(spellings).toHaveLength(1);
      // And that one spelling is a named definition rather than a use, so both
      // sides are derived from it.
      expect(source).toMatch(/^const MISSING = '__verify_walk_missing__';$/m);
    });

    // A refused eval and an element holding an empty string leave the same empty
    // stdout behind. Reading only stdout made the first indistinguishable from
    // the second, and a run spent its budget diagnosing a rendering race that
    // was a redeclaration throw. The refusal now has a stage of its own.
    it('records a refused browser eval as an eval-error failure carrying the runner stderr', () => {
      const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-walk-eval-'));

      // The driver reaches the browser only through `npx agent-browser`, so a
      // stub earlier on PATH is the whole of the failure injection: no real
      // browser is launched and nothing on the machine is touched.
      const stubDir = path.join(workdir, 'bin');
      fs.mkdirSync(stubDir, { recursive: true });
      fs.writeFileSync(path.join(stubDir, 'npx'),
        "#!/bin/sh\necho \"SyntaxError: Identifier '__find' has already been declared\" >&2\nexit 1\n",
        { mode: 0o755 });

      const run = spawnSync(process.execPath, [
        driverPath(),
        // A data URL is the stand-in for a served origin: it answers the host
        // probe, which is all the probe asks of it, and it keeps this test off
        // the network and off any port a parallel run might also want.
        '--host', 'data:text/plain,ok',
        '--themes', 'light',
        '--screens', 'orders:/orders:screen-orders',
        '--capdir', path.join(workdir, 'shots'),
        '--switcher', 'theme-switcher',
        '--theme-option', 'theme-option-{theme}',
        '--menu', 'nav-{screen}',
        // Port 1 answers nothing, so the driver takes its no-debugger path and
        // never asks the stub to attach to a browser.
        '--cdp-port', '1',
        '--ready-timeout', '5000',
      ], {
        encoding: 'utf8',
        timeout: DRIVER_TIMEOUT_MS,
        env: { ...process.env, PATH: `${stubDir}${path.delimiter}${process.env.PATH ?? ''}` },
      });

      expect(run.status).not.toBe(0);

      const parsed = JSON.parse(run.stdout) as { ok: boolean; failures: { stage: string; detail: string }[] };
      const evalErrors = parsed.failures.filter((failure) => failure.stage === 'eval-error');

      expect(parsed.ok).toBe(false);
      expect(evalErrors.length).toBeGreaterThan(0);
      expect(evalErrors[0].detail).toContain("Identifier '__find' has already been declared");
      // The readiness poll gives up on a refused eval rather than re-asking every
      // 400ms: unguarded, the 5s budget alone would file a dozen identical
      // records and bury the reason under them.
      expect(evalErrors.length).toBeLessThan(10);
      // The caller of a refused eval keeps the two apart rather than reporting
      // an absent control: the switcher click is the first operation that cannot
      // be dispatched, and its failure names the refused eval as the reason
      // instead of "no control carries that data-testid".
      const control = parsed.failures.find((failure) => failure.stage === 'control');
      expect(control?.detail).toContain('theme switcher');
      expect(control?.detail).toContain('the eval did not run');

      fs.rmSync(workdir, { recursive: true, force: true });
    });

    // The runner resolves a relative screenshot path against its own temporary
    // working directory and still reports the write as a success, so captures
    // taken under a relative capdir land where neither the byte-compare nor the
    // coverage cells look. Every path the driver hands out is absolute.
    it('resolves a relative capture directory against the caller, not the runner', () => {
      const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-walk-cwd-'));

      const run = spawnSync(process.execPath, [
        driverPath(),
        '--host', 'http://127.0.0.1:1',
        '--themes', 'light',
        '--screens', 'orders:/orders:screen-orders',
        '--capdir', 'shots',
        '--switcher', 'theme-switcher',
        '--theme-option', 'theme-option-{theme}',
        '--menu', 'nav-{screen}',
      ], { encoding: 'utf8', cwd: workdir, timeout: DRIVER_TIMEOUT_MS });

      const parsed = JSON.parse(run.stdout) as { capdir: string };

      expect(path.isAbsolute(parsed.capdir)).toBe(true);
      expect(path.basename(parsed.capdir)).toBe('shots');
      expect(fs.existsSync(path.join(workdir, 'shots', 'verify-walk.json'))).toBe(true);

      fs.rmSync(workdir, { recursive: true, force: true });
    });

    // A page the driver can complete a walk against, standing in for the
    // browser at the one seam the driver has: `npx agent-browser`. It answers
    // from a declared id list rather than a real DOM, and records every command
    // it was given, so a test asserts on what the driver actually drove instead
    // of on the driver's own account of it. Nothing here mocks the driver.
    const STUB_AGENT_BROWSER = `
const fs = require('node:fs');
const path = require('node:path');

const log = (line) => fs.appendFileSync(process.env.STUB_LOG, line + '\\n');
const ids = JSON.parse(process.env.STUB_IDS);
const argv = process.argv.slice(4); // past node, this file, --yes, agent-browser
const command = argv[0];

// A child that never returns anything, for the timeout path. The driver has to
// kill it and record that; nothing else in the run can end it.
if (process.env.STUB_HANG === '1') {
  log('hang ' + argv.join(' '));
  setInterval(() => {}, 1000);
  return;
}

if (command === 'open' && process.env.STUB_FAIL_OPEN === '1') {
  log('open-refused ' + argv[1]);
  process.stderr.write('NavigationError: net::ERR_CONNECTION_REFUSED\\n');
  process.exit(3);
}
if (command === 'screenshot') {
  // Identical bytes across themes on request: two registered themes can differ
  // only in tokens the captured screens never consume, and the identical
  // verdict that produces is a recorded fact the driver has to be able to reach.
  const body = process.env.STUB_IDENTICAL_SHOTS === '1' ? 'png:identical' : 'png:' + path.basename(argv[1]);
  fs.writeFileSync(argv[1], body);
  log('screenshot ' + path.basename(argv[1]));
  process.exit(0);
}
if (command !== 'eval') {
  log(argv.join(' '));
  process.exit(0);
}

const script = fs.readFileSync(0, 'utf8');
const found = /__find\\("([^"]*)"\\)/.exec(script);
const id = found === null ? null : found[1];
const present = id !== null && ids.includes(id);
// A switcher whose option click dispatches and whose theme does not change:
// the page goes on showing the theme named here whatever is clicked. It is the
// application failure the label check exists to catch, and without it every
// label read back agrees with what was just asked for.
const theme = () => (process.env.STUB_STICKY_THEME
  ? process.env.STUB_STICKY_THEME
  : (fs.existsSync(process.env.STUB_THEME)
    ? fs.readFileSync(process.env.STUB_THEME, 'utf8')
    : 'light'));

// One refused existence probe, for the difference between "the page holds no
// such element" and "the script never ran". Scoped to the probe so the control
// it names can still be clicked.
if (script.includes("'yes' : 'no'") && id === process.env.STUB_EVAL_ERROR_PROBE) {
  process.stderr.write('EvalError: the page refused the probe\\n');
  process.exit(1);
}

if (script.includes('__testids()')) {
  process.stdout.write(JSON.stringify(ids) + '\\n');
} else if (script.includes('setter.call')) {
  // Checked before the click branch: a fill dispatches input and change events,
  // so a stub that greps for dispatchEvent first answers every fill as a click.
  const typed = /setter\\.call\\(el, "((?:[^"\\\\]|\\\\.)*)"\\)/.exec(script)[1];
  log('fill ' + id + ' ' + typed);
  // A field that took something other than what was typed into it. Without it
  // the read-back is asserted only against a stub that always agrees, which is
  // the one case a read-back cannot catch anything in.
  const landed = process.env.STUB_FILL_DRIFT === '1' ? 'drift:' + typed : typed;
  process.stdout.write((present ? landed : '__verify_walk_missing__') + '\\n');
} else if (script.includes('dispatchEvent')) {
  log('click ' + id);
  // The event names are logged on their own line so a test can assert the whole
  // native sequence arrived. Greping for dispatchEvent alone cannot: a driver
  // reduced to one bare event still reads as a click here.
  log('events ' + [...script.matchAll(/new (?:Pointer|Mouse)Event\\('([a-z]+)'/g)].map((m) => m[1]).join(','));
  if (present && id.startsWith('theme-option-')) {
    fs.writeFileSync(process.env.STUB_THEME, id.slice('theme-option-'.length));
  }
  process.stdout.write((present ? 'dispatched' : '__verify_walk_missing__') + '\\n');
} else if (script.includes("'yes' : 'no'")) {
  process.stdout.write((present ? 'yes' : 'no') + '\\n');
} else {
  // The switcher's label answers with the theme this page was last switched
  // into, so a walk over several themes is confirmed against a moving reading
  // rather than against a constant that agrees with everything.
  if (id === 'theme-switcher' && present) process.stdout.write('Theme: ' + theme() + '\\n');
  else process.stdout.write((present ? 'text of ' + id : '__verify_walk_missing__') + '\\n');
}
process.exit(0);
`;

    interface StubRun {
      status: number | null;
      result: {
        ok: boolean;
        coverageFile: string | null;
        browser: { command: string | null };
        themeSet: { source: string; themes: string[] };
        menuResolution: { screen: string; testid: string | null; extensionId: string | null; source: string }[];
        themes: {
          theme: string;
          labelConfirmed: boolean;
          labelRead: string | null;
          panelCollapsed: boolean | null;
          captures: { screen: string; state: string; readyConfirmed: boolean }[];
          // `expected` is absent on a click, which declares nothing to compare against.
          readBacks: { action: string; testid: string; expected?: string | null; actual: string; ok: boolean }[];
          comparisons: { against: string; screen: string; state: string; command: string; exit: number | null; verdict: string }[];
        }[];
        failures: { stage: string; detail: string }[];
      };
      commands: string[];
      coverage: string;
      // Where the run was told to write, and the directory that holds it: a
      // capture is confined to the first, and the second is where a name that
      // escaped it would land.
      capdir: string;
      workdir: string;
      cleanup: () => void;
    }

    // The driver answers every run it cannot perform with a JSON result record,
    // malformed arguments included, so a stdout that does not open with `{` means
    // the driver died without recording anything rather than that it refused.
    // Named here for the same reason `run.error` is: a bare JSON.parse failure
    // never mentions the driver's own output, and the output is where the reason
    // is.
    function expectResultRecord(run: { stdout: string; stderr: string; status: number | null }): void {
      if (!run.stdout.trimStart().startsWith('{')) {
        throw new Error(`the driver printed no result record and exited ${run.status}`
          + `\nstdout: ${run.stdout}\nstderr: ${run.stderr}`);
      }
    }

    // `files` writes the driver's JSON inputs into the run's own directory and
    // declares them, so a test states the states/registry content it needs
    // rather than managing a second temporary tree for it.
    function runAgainstStub(
      args: string[],
      ids: string[],
      env: NodeJS.ProcessEnv = {},
      files: { states?: unknown; registry?: unknown } = {},
    ): StubRun {
      const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-walk-walk-'));
      const stubDir = path.join(workdir, 'bin');
      fs.mkdirSync(stubDir, { recursive: true });

      const stubFile = path.join(stubDir, 'agent-browser.cjs');
      fs.writeFileSync(stubFile, STUB_AGENT_BROWSER);
      // The shim hardcodes this interpreter rather than resolving `node` off the
      // PATH it is itself prepended to, so the stub cannot end up running under
      // whatever else that PATH happens to offer.
      fs.writeFileSync(path.join(stubDir, 'npx'),
        `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(stubFile)} "$@"\n`,
        { mode: 0o755 });

      const logFile = path.join(workdir, 'commands.log');
      fs.writeFileSync(logFile, '');

      const declared: string[] = [];
      if (files.states !== undefined) {
        const statesFile = path.join(workdir, 'states.json');
        fs.writeFileSync(statesFile, JSON.stringify(files.states));
        declared.push('--states', statesFile);
      }
      if (files.registry !== undefined) {
        const registryFile = path.join(workdir, 'themes.json');
        fs.writeFileSync(registryFile, JSON.stringify(files.registry));
        declared.push('--themes', 'registry', '--theme-registry', registryFile);
      }

      const capdir = path.join(workdir, 'shots');
      const run = spawnSync(process.execPath, [
        driverPath(),
        // Answers the host probe without a port, exactly as in the eval test.
        '--host', 'data:text/plain,ok',
        '--themes', 'light',
        '--capdir', capdir,
        '--switcher', 'theme-switcher',
        '--theme-option', 'theme-option-{theme}',
        '--cdp-port', '1',
        '--ready-timeout', '5000',
        '--command-timeout', STUB_COMMAND_TIMEOUT_MS,
        ...declared,
        ...args,
      ], {
        encoding: 'utf8',
        timeout: DRIVER_TIMEOUT_MS,
        env: {
          ...process.env, ...env,
          PATH: `${stubDir}${path.delimiter}${process.env.PATH ?? ''}`,
          STUB_LOG: logFile,
          STUB_IDS: JSON.stringify(ids),
          STUB_THEME: path.join(workdir, 'active-theme'),
        },
      });

      // A driver killed at the bound above leaves no result to parse, and the
      // JSON.parse failure that follows says nothing about why. Named here.
      if (run.error) throw new Error(`the driver did not return: ${run.error.message}`);
      expectResultRecord(run);

      const coverageFile = path.join(capdir, 'verification-coverage.md');
      return {
        status: run.status,
        result: JSON.parse(run.stdout) as StubRun['result'],
        commands: fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean),
        coverage: fs.existsSync(coverageFile) ? fs.readFileSync(coverageFile, 'utf8') : '',
        capdir,
        workdir,
        cleanup: () => fs.rmSync(workdir, { recursive: true, force: true }),
      };
    }

    // Every input-validation refusal has to happen on the arguments alone, so
    // these runs need no stub, no server and no browser: what they assert is
    // that the driver never got as far as one.
    function runRefusal(extra: string[]): {
      status: number | null;
      failures: { stage: string; detail: string }[];
      capdirExists: boolean;
      cleanup: () => void;
    } {
      const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-walk-args-'));
      const capdir = path.join(workdir, 'shots');

      const run = spawnSync(process.execPath, [
        driverPath(),
        '--host', 'http://127.0.0.1:1',
        '--themes', 'light',
        '--screens', 'orders:/orders:screen-orders',
        '--capdir', capdir,
        '--switcher', 'theme-switcher',
        '--theme-option', 'theme-option-{theme}',
        '--menu', 'nav-{screen}',
        ...extra,
      ], { encoding: 'utf8', timeout: DRIVER_TIMEOUT_MS });

      if (run.error) throw new Error(`the driver did not return: ${run.error.message}`);
      expectResultRecord(run);

      return {
        status: run.status,
        failures: (JSON.parse(run.stdout) as { failures: { stage: string; detail: string }[] }).failures,
        capdirExists: fs.existsSync(capdir),
        cleanup: () => fs.rmSync(workdir, { recursive: true, force: true }),
      };
    }

    // Counted on unescaped pipes only, which is what a markdown reader treats as
    // a cell boundary: the row has to hold exactly the columns the header
    // declares, whatever text was written into it.
    function expectWholeRow(coverage: string): void {
      const cellBoundary = /(?<!\\)\|/;
      const lines = coverage.split('\n');
      expect(lines[2].split(cellBoundary)).toHaveLength(lines[0].split(cellBoundary).length);
    }

    const EXT_PREFIX = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~best';
    const LOGIN_EXT = `${EXT_PREFIX}.login.screens.login.v1`;
    const TASKS_EXT = `${EXT_PREFIX}.tasks.screens.tasks.v1`;
    const REPORTS_EXT = `${EXT_PREFIX}.reports.screens.reports.v1`;
    const HOST_IDS = ['theme-switcher', 'theme-option-light', 'screen-login', 'screen-tasks', 'screen-reports'];

    // The host keys each menu item by the screen's whole extension id, so a
    // pattern holding only the short screen name can never name one. Run 30 hit
    // exactly that, fell back to route navigation, and drove the menu clicks it
    // still owed by hand.
    it('reaches a menu item keyed by the screen full extension id, discovered or declared', () => {
      const run = runAgainstStub([
        '--screens', `login:/login:screen-login,tasks:/tasks:screen-tasks,reports:/reports:screen-reports:${REPORTS_EXT}`,
        '--menu', 'menu-item-{extensionId}',
      ], [...HOST_IDS, `menu-item-${LOGIN_EXT}`, `menu-item-${TASKS_EXT}`, `menu-item-${REPORTS_EXT}`]);

      // The whole walk completes through the menu: this is the run that
      // previously had no expressible pattern at all.
      expect(run.result.failures).toEqual([]);
      expect(run.status).toBe(0);

      // `tasks` names no id, so the driver reads the page's ids back and keeps
      // the one carrying "tasks" as a segment; `reports` declares its own and
      // costs no eval. Both are disclosed with the source they came from.
      expect(run.result.menuResolution).toEqual([
        { screen: 'tasks', testid: `menu-item-${TASKS_EXT}`, extensionId: TASKS_EXT, source: 'discovered' },
        { screen: 'reports', testid: `menu-item-${REPORTS_EXT}`, extensionId: REPORTS_EXT, source: 'declared' },
      ]);
      // The clicks landed on the full ids, not on anything derived from the
      // short name - which is the part a JSON record alone could not prove.
      expect(run.commands).toContain(`click menu-item-${TASKS_EXT}`);
      expect(run.commands).toContain(`click menu-item-${REPORTS_EXT}`);

      run.cleanup();
    });

    // The id machinery is additive. A host that does key its menu by the short
    // name must keep resolving on the pattern alone, and without spending an
    // eval to read a page it has no question for.
    it('leaves the {screen} pattern resolving on its own, with no id read off the page', () => {
      const run = runAgainstStub([
        '--screens', 'login:/login:screen-login,tasks:/tasks:screen-tasks',
        '--menu', 'nav-{screen}',
      ], [...HOST_IDS, 'nav-login', 'nav-tasks']);

      expect(run.result.failures).toEqual([]);
      expect(run.result.menuResolution).toEqual([
        { screen: 'tasks', testid: 'nav-tasks', extensionId: null, source: 'pattern' },
      ]);
      expect(run.commands).toContain('click nav-tasks');

      run.cleanup();
    });

    // `open` and `reload` were fired and forgotten. A navigation that never
    // happened surfaced only as a readiness timeout a full budget later, and on
    // a screen declared without a ready testid never at all - the walk carried
    // on capturing whatever was still on screen under the next screen's name.
    it('fails a navigation loudly on the runner exit status, and files nothing under the screen it never reached', () => {
      const run = runAgainstStub([
        '--screens', 'login:/login:screen-login,tasks:/tasks:screen-tasks',
        '--menu', 'nav-{screen}',
      ], [...HOST_IDS, 'nav-login', 'nav-tasks'], { STUB_FAIL_OPEN: '1' });

      expect(run.status).not.toBe(0);

      const navErrors = run.result.failures.filter((failure) => failure.stage === 'navigation-error');
      expect(navErrors).toHaveLength(1);
      expect(navErrors[0].detail).toContain('open data:text/plain,ok/login');
      expect(navErrors[0].detail).toContain('net::ERR_CONNECTION_REFUSED');
      // The failure is caught where it happened, not one readiness budget later.
      expect(run.result.failures.some((failure) => failure.stage === 'ready')).toBe(false);

      // Nothing is filed under the screen the page never reached; the screen
      // that was reached is still walked, so one bad navigation does not cost
      // the run its other coverage.
      const captured = run.result.themes[0].captures.map((capture) => capture.screen);
      expect(captured).not.toContain('login');
      expect(captured).toContain('tasks');

      run.cleanup();
    });

    // One candidate is the answer and anything else is a refusal: a wrong menu
    // item navigates somewhere real, and every reading after it is a reading of
    // the wrong screen under this screen's name.
    it('refuses an ambiguous menu candidate set rather than picking the first of them', () => {
      const NEIGHBOUR_EXT = `${EXT_PREFIX}.tasks.screens.tasks_archive.v1`;
      const run = runAgainstStub([
        '--screens', 'login:/login:screen-login,tasks:/tasks:screen-tasks',
        '--menu', 'menu-item-{extensionId}',
      ], [...HOST_IDS, `menu-item-${LOGIN_EXT}`, `menu-item-${TASKS_EXT}`, `menu-item-${NEIGHBOUR_EXT}`]);

      expect(run.status).not.toBe(0);

      const ambiguous = run.result.failures.filter((failure) => failure.stage === 'menu-resolve');
      expect(ambiguous).toHaveLength(1);
      expect(ambiguous[0].detail).toContain(TASKS_EXT);
      expect(ambiguous[0].detail).toContain(NEIGHBOUR_EXT);

      // Unresolved is disclosed as unresolved, and no menu item is clicked at
      // all - the failure mode a pick would produce is a click that landed.
      expect(run.result.menuResolution).toEqual([
        { screen: 'tasks', testid: null, extensionId: null, source: 'unresolved' },
      ]);
      expect(run.commands.some((line) => line.startsWith('click menu-item-'))).toBe(false);
      expect(run.result.themes[0].captures.map((capture) => capture.screen)).not.toContain('tasks');

      run.cleanup();
    });

    // The coverage file is this step's stated deliverable: a report is filled
    // from it, and a run that composed one without writing the file left the
    // developer with the project and none of the record.
    it('writes the coverage rows to a file, with each capture and its readiness in the cell', () => {
      const run = runAgainstStub([
        '--screens', 'login:/login:screen-login,tasks:/tasks',
        '--nav', 'route',
      ], HOST_IDS);

      expect(run.result.failures).toEqual([]);
      expect(run.status).toBe(0);
      expect(run.result.coverageFile).not.toBeNull();

      expect(run.coverage).toContain('| Theme | Opened | Visually distinct from previous |');
      expect(run.coverage).toContain('| light | verified | first theme |');
      // A screen declaring a ready handle is captured after that handle appears;
      // one declaring none is captured after a bare settle. A cell that cannot
      // tell them apart reports the weaker capture as the stronger one.
      expect(run.coverage).toContain('fresh (light-login-fresh.png, ready confirmed)');
      expect(run.coverage).toContain('fresh (light-tasks-fresh.png, ready unconfirmed)');

      run.cleanup();
    });

    // A cell filled from a name the invocation supplied is a cell that name can
    // corrupt: one `|` in it closes the cell and shifts every column after it.
    it('escapes a pipe in a theme name instead of letting it close the cell', () => {
      const run = runAgainstStub([
        '--screens', 'login:/login:screen-login',
        '--nav', 'route',
        // ONE theme whose name carries a pipe, not two themes. Its option testid
        // becomes `theme-option-light|dark`, which the stub's ids do not carry,
        // so the option click cannot be dispatched and the theme is recorded as
        // not-opened. The pipe reaches the table through the theme-name cell and
        // through the control failure written beside it.
        '--themes', 'light|dark',
      ], HOST_IDS);

      expect(run.result.themes[0].labelConfirmed).toBe(false);
      expect(run.coverage).toContain('| light\\|dark |');
      expect(run.coverage).toContain('theme option for "light\\|dark" "theme-option-light\\|dark" was not clicked');
      expectWholeRow(run.coverage);

      run.cleanup();
    });

    // The other side of the same cell: a pipe the page itself put into a reading
    // the table quotes back. The label of a theme that did not open is written
    // into the row verbatim, so the page decides that text and not the caller.
    it('escapes a pipe read off the page instead of letting it close the cell', () => {
      const run = runAgainstStub([
        '--screens', 'login:/login:screen-login',
        '--nav', 'route',
      ], HOST_IDS, { STUB_STICKY_THEME: 'da|rk' });

      expect(run.status).not.toBe(0);
      expect(run.result.themes[0].labelRead).toBe('Theme: da|rk');
      expect(run.result.themes[0].labelConfirmed).toBe(false);
      // Escaped in the cell, unescaped in the JSON record: the table is what a
      // pipe corrupts, and the record is what a report reads the truth from.
      expect(run.coverage).toContain('not-opened (label read "Theme: da\\|rk")');
      expectWholeRow(run.coverage);

      run.cleanup();
    });

    // A theme name out of a registry and a screen name off the command line both
    // reach the capture path, and a name carrying path separators used to resolve
    // out of the run's own directory: `../escape` writes a level above the capture
    // directory, where nothing in this run is entitled to write and where neither
    // the byte-compare nor the coverage cells ever look. The name is reduced to
    // the file-name alphabet rather than refused, so the walk still runs and the
    // traversal is gone from the file it writes.
    it.each<[string, string[], string]>([
      ['a theme name', ['--themes', '../escape', '--screens', 'login:/login:screen-login'], 'escape-login-fresh.png'],
      ['a screen name', ['--themes', 'light', '--screens', '../login:/login:screen-login'], 'light-login-fresh.png'],
    ])('confines a capture to the capture directory when %s carries a path traversal', (_what, declared, file) => {
      const run = runAgainstStub([...declared, '--nav', 'route'],
        ['theme-switcher', 'theme-option-light', 'theme-option-../escape', 'screen-login']);

      // The odd name costs the run nothing: the theme opens, and the capture is
      // taken and recorded like any other.
      expect(run.result.failures).toEqual([]);
      expect(run.status).toBe(0);
      expect(run.result.themes[0].labelConfirmed).toBe(true);
      expect(run.result.themes[0].captures.map((capture) => capture.state)).toEqual(['fresh']);

      // Written inside the capture directory, under a name the traversal is
      // reduced out of rather than resolved through.
      expect(fs.readdirSync(run.capdir).sort()).toEqual([file, 'verification-coverage.md', 'verify-walk.json']);
      expect(run.coverage).toContain(`fresh (${file}, ready confirmed)`);
      // And nothing landed in the directory above it, which is where the
      // unreduced name pointed.
      expect(fs.readdirSync(run.workdir).filter((entry) => entry.endsWith('.png'))).toEqual([]);

      run.cleanup();
    });

    // The whole native sequence, not a synthetic click: a control listening for
    // pointerdown sees nothing of a bare click() and the screen stays as it was,
    // while the command still reports success.
    it('drives every click as the full native pointer sequence', () => {
      const run = runAgainstStub([
        '--screens', 'login:/login:screen-login',
        '--nav', 'route',
      ], HOST_IDS);

      const sequences = run.commands.filter((line) => line.startsWith('events '));
      expect(sequences.length).toBeGreaterThan(0);
      for (const sequence of sequences) {
        expect(sequence).toBe('events pointerdown,mousedown,pointerup,mouseup,click');
      }

      run.cleanup();
    });

    // Every declared control operation has to report as dispatched. Discarded,
    // the outcome let a single-theme run already showing the requested theme
    // pass with no theme option on the page at all: the label agreed, and
    // nothing had switched.
    it('fails the theme when a declared control is not on the page, naming the test id', () => {
      const run = runAgainstStub([
        '--screens', 'login:/login:screen-login',
        '--nav', 'route',
        '--panel-expand', 'panel-expand',
        '--panel-collapse', 'panel-collapse',
        // The switcher is there and the label reads "light" either way, which is
        // exactly how a missing option used to pass unnoticed.
      ], ['theme-switcher', 'screen-login']);

      expect(run.status).not.toBe(0);

      const control = run.result.failures.filter((failure) => failure.stage === 'control');
      expect(control).toHaveLength(1);
      expect(control[0].detail).toContain('panel-expand');
      expect(control[0].detail).toContain('no control carries that data-testid');
      // Nothing is captured under a theme whose controls could not be operated.
      expect(run.result.themes[0].captures).toEqual([]);
      expect(run.coverage).toContain('not-opened (dev panel expand control "panel-expand" was not clicked');

      run.cleanup();
    });

    // Confirmation used to be a substring test over the label with its
    // punctuation stripped, so a registry holding `dark` and `darker` confirmed
    // `dark` off a label reading "Darker" - and every capture in that block was
    // filed against a theme that never opened. The requested name has to occupy
    // whole words of the label.
    it('does not confirm a theme off a label that merely carries its name inside another word', () => {
      const wrong = runAgainstStub([
        '--themes', 'dark',
        '--screens', 'login:/login:screen-login',
        '--nav', 'route',
        // The option click dispatches, and the page goes on showing "darker".
      ], [...HOST_IDS, 'theme-option-dark'], { STUB_STICKY_THEME: 'darker' });

      expect(wrong.status).not.toBe(0);
      expect(wrong.result.themes[0].labelConfirmed).toBe(false);
      // The click landed, so this is not a control failure being reported: the
      // label is what refused the theme.
      expect(wrong.commands).toContain('click theme-option-dark');
      expect(wrong.result.failures.some((failure) => failure.stage === 'control')).toBe(false);

      const refused = wrong.result.failures.filter((failure) => failure.stage === 'theme-switch');
      expect(refused).toHaveLength(1);
      expect(refused[0].detail).toContain('Theme: darker');
      // Nothing is captured or compared under a theme that did not open.
      expect(wrong.result.themes[0].captures).toEqual([]);
      wrong.cleanup();

      // The same rule still confirms the theme whose name the label does carry
      // as a word, so this is not a check that refuses everything.
      const right = runAgainstStub([
        '--themes', 'darker',
        '--screens', 'login:/login:screen-login',
        '--nav', 'route',
      ], [...HOST_IDS, 'theme-option-darker'], { STUB_STICKY_THEME: 'darker' });

      expect(right.result.failures).toEqual([]);
      expect(right.status).toBe(0);
      expect(right.result.themes[0].labelConfirmed).toBe(true);
      right.cleanup();
    });

    // Where one theme's words are a whole run of another's, every label naming
    // the longer one names the shorter one too. A confirmation cannot say which
    // theme opened, so the run is refused on the theme set alone rather than
    // filing captures under a guess.
    it('refuses a theme set holding two names one switcher label could name at once', () => {
      const run = runRefusal(['--themes', 'dark,dark mode']);

      expect(run.status).not.toBe(0);
      expect(run.failures.map((failure) => failure.stage)).toEqual(['arguments']);
      expect(run.failures[0].detail).toContain('cannot be told apart');
      expect(run.failures[0].detail).toContain('--theme-labels');
      // Refused on the arguments: no capture directory, no browser, no host.
      expect(run.capdirExists).toBe(false);
      run.cleanup();

      // And a label declared per theme is the way out of it, so the refusal is a
      // gate rather than a dead end.
      const separated = runRefusal([
        '--themes', 'dark,dark mode',
        '--theme-labels', 'dark=Dark Classic,dark mode=Dark Mode',
      ]);

      expect(separated.failures.map((failure) => failure.stage)).toEqual(['host-probe']);
      separated.cleanup();
    });

    // The collapse is the same class one control along, and it fails later: the
    // label has already confirmed by then, so a discarded collapse outcome
    // leaves the theme reading as opened and its captures carrying host chrome.
    it('fails the theme when the panel collapse control is not on the page', () => {
      const run = runAgainstStub([
        '--screens', 'login:/login:screen-login',
        '--nav', 'route',
        '--panel-expand', 'panel-expand',
        '--panel-collapse', 'panel-collapse',
      ], [...HOST_IDS, 'panel-expand']);

      expect(run.status).not.toBe(0);
      expect(run.result.themes[0].labelConfirmed).toBe(true);

      const control = run.result.failures.filter((failure) => failure.stage === 'control');
      expect(control).toHaveLength(1);
      expect(control[0].detail).toContain('panel-collapse');
      expect(run.result.themes[0].captures).toEqual([]);

      run.cleanup();
    });

    // "The page holds no such element" and "the script never ran" call for
    // different repairs, and collapsing both into absence is what sent a run
    // hunting a rendering race that did not exist.
    it('keeps a refused existence probe apart from an absent control', () => {
      const run = runAgainstStub([
        '--screens', 'login:/login:screen-login',
        '--nav', 'route',
        '--panel-expand', 'panel-expand',
        '--panel-collapse', 'panel-collapse',
      ], [...HOST_IDS, 'panel-expand', 'panel-collapse'], { STUB_EVAL_ERROR_PROBE: 'panel-expand' });

      expect(run.status).not.toBe(0);

      const panel = run.result.failures.filter((failure) => failure.stage === 'panel');
      expect(panel).toHaveLength(1);
      expect(panel[0].detail).toContain('could not be confirmed');
      expect(panel[0].detail).toContain('the eval did not run');
      // Not false: the page was never asked, and a report cannot say the panel
      // stayed open on the strength of a probe that did not run.
      expect(run.result.themes[0].panelCollapsed).toBeNull();

      run.cleanup();
    });

    // The states file is where every read-back comes from, and a read-back that
    // cannot disagree is not one: the exit-code contract says every read-back
    // agreed, so a fill whose field took something else has to break it.
    it('records every declared read-back and passes the run when they all agree', () => {
      const run = runAgainstStub([
        '--screens', 'login:/login:screen-login',
        '--nav', 'route',
      ], [...HOST_IDS, 'screen-name-input', 'screen-submit', 'screen-status'], {}, {
        states: {
          login: [{
            state: 'submitted',
            actions: [
              { kind: 'fill', testid: 'screen-name-input', value: 'Grace' },
              { kind: 'click', testid: 'screen-submit' },
              { kind: 'read', testid: 'screen-status', contains: 'text of screen-status' },
            ],
          }],
        },
      });

      expect(run.result.failures).toEqual([]);
      expect(run.status).toBe(0);
      expect(run.result.themes[0].readBacks.map((back) => [back.action, back.ok])).toEqual([
        ['fill', true], ['click', true], ['read', true],
      ]);
      expect(run.commands).toContain('fill screen-name-input Grace');
      expect(run.coverage).toContain('submitted (light-login-submitted.png, ready confirmed)');

      run.cleanup();
    });

    // The other half of the sentinel: a `read` of a control the page does not
    // carry has to fail. It reads back the sentinel, and a check comparing
    // against anything else - a second literal one edit out of step, say - would
    // accept that reading and report the state as read.
    it('fails a read of a control the page does not carry', () => {
      const run = runAgainstStub([
        '--screens', 'login:/login:screen-login',
        '--nav', 'route',
      ], HOST_IDS, {}, {
        states: {
          login: [{ state: 'submitted', actions: [{ kind: 'read', testid: 'screen-status' }] }],
        },
      });

      expect(run.status).not.toBe(0);

      const reads = run.result.failures.filter((failure) => failure.stage === 'read');
      expect(reads).toHaveLength(1);
      expect(reads[0].detail).toContain('screen-status');
      expect(run.result.themes[0].readBacks[0]).toMatchObject({
        action: 'read', testid: 'screen-status', actual: '__verify_walk_missing__', ok: false,
      });

      run.cleanup();
    });

    // The sentinel is text, so a declared `contains` it happens to carry read an
    // absent control as a state that was read back: "missing" is a substring of
    // __verify_walk_missing__, the substring test passed on the sentinel itself,
    // and the coverage row claimed a reading of a control the page never held.
    it('fails a read of an absent control whose declared contains is a substring of the missing sentinel', () => {
      const run = runAgainstStub([
        '--screens', 'login:/login:screen-login',
        '--nav', 'route',
      ], HOST_IDS, {}, {
        states: {
          login: [{
            state: 'submitted',
            actions: [{ kind: 'read', testid: 'screen-status', contains: 'missing' }],
          }],
        },
      });

      expect(run.status).not.toBe(0);

      const reads = run.result.failures.filter((failure) => failure.stage === 'read');
      expect(reads).toHaveLength(1);
      expect(reads[0].detail).toContain('screen-status');
      expect(run.result.themes[0].readBacks[0]).toMatchObject({
        action: 'read',
        testid: 'screen-status',
        expected: 'missing',
        actual: '__verify_walk_missing__',
        ok: false,
      });

      run.cleanup();
    });

    // A value the read-back cannot return verbatim can never agree with itself,
    // so the run would exit non-zero over a value the field actually took. The
    // reading is the last non-empty line, trimmed, with surrounding quotes off,
    // and a declared value outside that shape is refused before a browser is
    // reached rather than discovered as a disagreement.
    it.each([
      ['a newline', 'first\nsecond'],
      ['leading whitespace', '  Grace'],
      ['trailing whitespace', 'Grace  '],
      ['wrapping quotes', '"Grace"'],
    ])('refuses a fill value carrying %s, on the arguments alone', (_what, value) => {
      const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-walk-fill-'));
      const statesFile = path.join(workdir, 'states.json');
      fs.writeFileSync(statesFile, JSON.stringify({
        orders: [{ state: 'typed', actions: [{ kind: 'fill', testid: 'name', value }] }],
      }));

      const run = runRefusal(['--states', statesFile]);

      expect(run.status).not.toBe(0);
      expect(run.failures.map((failure) => failure.stage)).toEqual(['arguments']);
      expect(run.failures[0].detail).toContain('the read-back cannot confirm');
      expect(run.capdirExists).toBe(false);

      run.cleanup();
      fs.rmSync(workdir, { recursive: true, force: true });
    });

    it('fails the run when a fill reads back something other than what was typed', () => {
      const run = runAgainstStub([
        '--screens', 'login:/login:screen-login',
        '--nav', 'route',
      ], [...HOST_IDS, 'screen-name-input'], { STUB_FILL_DRIFT: '1' }, {
        states: {
          login: [{ state: 'submitted', actions: [{ kind: 'fill', testid: 'screen-name-input', value: 'Grace' }] }],
        },
      });

      expect(run.status).not.toBe(0);

      const readBack = run.result.failures.filter((failure) => failure.stage === 'read-back');
      expect(readBack).toHaveLength(1);
      expect(readBack[0].detail).toContain('screen-name-input');
      expect(readBack[0].detail).toContain('drift:Grace');
      expect(run.result.themes[0].readBacks[0].ok).toBe(false);

      run.cleanup();
    });

    // The verdict is the comparison command's own exit code and nothing else.
    // Identical captures are a recorded fact: two registered themes can differ
    // only in tokens the captured screens never consume, and a run that reported
    // them as visibly distinct claimed something it never saw.
    it('records identical captures as identical, from the comparison command exit code', () => {
      const run = runAgainstStub([
        '--themes', 'light,dark',
        '--screens', 'login:/login:screen-login',
        '--nav', 'route',
      ], [...HOST_IDS, 'theme-option-dark'], { STUB_IDENTICAL_SHOTS: '1' });

      expect(run.result.failures).toEqual([]);
      expect(run.status).toBe(0);
      expect(run.result.themes.map((theme) => [theme.theme, theme.labelConfirmed])).toEqual([
        ['light', true], ['dark', true],
      ]);
      expect(run.result.themes[1].comparisons).toEqual([{
        against: 'light',
        screen: 'login',
        state: 'fresh',
        command: 'cmp -s light-login-fresh.png dark-login-fresh.png',
        exit: 0,
        verdict: 'identical',
      }]);
      expect(run.coverage).toContain('login/fresh: identical (cmp exit 0)');

      run.cleanup();
    });

    it('records a differing pair as differs, from that same exit code', () => {
      const run = runAgainstStub([
        '--themes', 'light,dark',
        '--screens', 'login:/login:screen-login',
        '--nav', 'route',
      ], [...HOST_IDS, 'theme-option-dark']);

      expect(run.result.failures).toEqual([]);
      expect(run.result.themes[1].comparisons.map((cmp) => [cmp.verdict, cmp.exit])).toEqual([['differs', 1]]);
      expect(run.coverage).toContain('login/fresh: differs (cmp exit 1)');

      run.cleanup();
    });

    // Provenance: a report claiming the set came from the host's theme
    // registration is a claim this field either backs or contradicts.
    it('records a theme set read from a registry file as coming from that file', () => {
      const run = runAgainstStub([
        '--screens', 'login:/login:screen-login',
        '--nav', 'route',
      ], [...HOST_IDS, 'theme-option-dark'], {}, { registry: { themes: ['light', 'dark'] } });

      expect(run.result.failures).toEqual([]);
      expect(run.result.themeSet.themes).toEqual(['light', 'dark']);
      expect(run.result.themeSet.source.startsWith('registry:')).toBe(true);
      expect(run.result.themeSet.source.endsWith('themes.json')).toBe(true);

      run.cleanup();
    });

    // The one hang the driver could not survive: every browser interaction is a
    // child process, and an unbounded one blocks the walk forever on a runner
    // that stopped answering.
    it('kills a browser command that never returns, and records it as a timeout', () => {
      const run = runAgainstStub([
        '--screens', 'login:/login:screen-login',
        '--nav', 'route',
        '--command-timeout', '800',
      ], HOST_IDS, { STUB_HANG: '1' });

      expect(run.status).not.toBe(0);

      const timeouts = run.result.failures.filter((failure) => failure.stage === 'timeout');
      expect(timeouts.length).toBeGreaterThan(0);
      expect(timeouts[0].detail).toContain('killed after 800ms');
      expect(run.result.themes[0].captures).toEqual([]);

      run.cleanup();
    });

    // --browser-cmd may name an installed binary, and an installed binary's path
    // carries spaces: a whitespace split cuts
    // "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" into four
    // pieces that name nothing, and every browser command then fails to spawn.
    // The quoted path stays one argument, and what follows it stays an argument of
    // its own rather than being glued onto the path.
    it('drives a --browser-cmd whose quoted path carries spaces, keeping the rest as separate arguments', () => {
      const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-walk-browser-cmd-'));
      const spaced = path.join(workdir, 'dir with space');
      fs.mkdirSync(spaced, { recursive: true });
      const stubFile = path.join(spaced, 'agent-browser.cjs');
      fs.writeFileSync(stubFile, STUB_AGENT_BROWSER);
      const logFile = path.join(workdir, 'commands.log');
      fs.writeFileSync(logFile, '');

      // Records the argument handed to it after the path and then drops it, so
      // what the stub itself sees is the argv shape the PATH shim produces
      // everywhere else in this suite. Both halves of the assertion come out of
      // that: the flag arrived on its own, and the whole walk ran through a
      // launcher whose path a split would have destroyed.
      const launcher = path.join(spaced, 'browser launcher');
      fs.writeFileSync(launcher,
        `#!/bin/sh\nprintf 'launched with %s\\n' "$1" >> ${JSON.stringify(logFile)}\nshift\n`
        + `exec ${JSON.stringify(process.execPath)} ${JSON.stringify(stubFile)} --yes agent-browser "$@"\n`,
        { mode: 0o755 });

      const capdir = path.join(workdir, 'shots');
      const run = spawnSync(process.execPath, [
        driverPath(),
        '--host', 'data:text/plain,ok',
        '--themes', 'light',
        '--screens', 'login:/login:screen-login',
        '--nav', 'route',
        '--capdir', capdir,
        '--switcher', 'theme-switcher',
        '--theme-option', 'theme-option-{theme}',
        '--cdp-port', '1',
        '--ready-timeout', '5000',
        '--command-timeout', STUB_COMMAND_TIMEOUT_MS,
        // The launcher is reached by the path alone, so this run needs no stub on
        // PATH at all: what is under test is the driver's reading of the value.
        '--browser-cmd', `"${launcher}" --forwarded`,
      ], {
        encoding: 'utf8',
        timeout: DRIVER_TIMEOUT_MS,
        env: {
          ...process.env,
          STUB_LOG: logFile,
          STUB_IDS: JSON.stringify(HOST_IDS),
          STUB_THEME: path.join(workdir, 'active-theme'),
        },
      });

      if (run.error) throw new Error(`the driver did not return: ${run.error.message}`);
      expectResultRecord(run);

      const result = JSON.parse(run.stdout) as StubRun['result'];
      expect(result.failures).toEqual([]);
      expect(run.status).toBe(0);
      expect(result.browser.command).toBe(`${launcher} --forwarded`);

      const commands = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
      expect(commands).toContain('launched with --forwarded');
      expect(commands).toContain('screenshot light-login-fresh.png');

      fs.rmSync(workdir, { recursive: true, force: true });
    });

    // Either way of closing an unbalanced quote - dropping it, or ending the
    // token where it opened - spawns a command line the caller did not write, so
    // the invocation is refused instead of guessed at.
    it('refuses a --browser-cmd carrying an unbalanced quote', () => {
      const run = runRefusal(['--browser-cmd', '"/tmp/dir with space/stub --flag']);

      expect(run.status).not.toBe(0);
      expect(run.failures.map((failure) => failure.stage)).toEqual(['arguments']);
      expect(run.failures[0].detail).toContain('unbalanced double quote');
      expect(run.capdirExists).toBe(false);

      run.cleanup();
    });

    // A --browser-cmd naming nothing is the one reading of this flag that cannot
    // be answered by a failed browser call: an empty command file reaches
    // spawnSync as ERR_INVALID_ARG_VALUE, thrown out of the first browser
    // interaction and past the validation that records a refusal, so the caller
    // gets a stack trace instead of a result record. Whitespace alone tokenizes
    // to no tokens; a quoted empty command to one token that is empty, which the
    // token count the tokenizer used to be trusted for cannot see.
    it.each([
      ['whitespace alone', '   '],
      ['a quoted empty command', '""'],
      ['a quoted empty command carrying flags', "'' --headless"],
    ])('refuses a --browser-cmd that is %s, before a browser is reached', (_what, value) => {
      const run = runRefusal(['--browser-cmd', value]);

      expect(run.status).not.toBe(0);
      expect(run.failures.map((failure) => failure.stage)).toEqual(['arguments']);
      expect(run.failures[0].detail).toContain('--browser-cmd');
      expect(run.failures[0].detail).toContain('names no command to run');
      expect(run.capdirExists).toBe(false);

      run.cleanup();
    });

    // The result has to reach the caller even when the path it was asked for
    // cannot be written: a record that went nowhere is indistinguishable from a
    // run that never happened.
    it('still prints its result, and says so, when the output path cannot be written', () => {
      const run = runAgainstStub([
        '--screens', 'login:/login:screen-login',
        '--nav', 'route',
        // A path under a file rather than a directory: the mkdir fails ENOTDIR.
        '--json-out', '/dev/null/nope/verify-walk.json',
      ], HOST_IDS);

      expect(run.status).not.toBe(0);
      expect(run.result.ok).toBe(false);
      const output = run.result.failures.filter((failure) => failure.stage === 'output');
      expect(output).toHaveLength(1);
      expect(output[0].detail).toContain('/dev/null/nope/verify-walk.json');

      run.cleanup();
    });

    // A capture directory shared with an earlier run leaves that run's files
    // exactly where this one goes looking, and neither the byte-compare nor the
    // coverage cells can tell which run wrote a file they address by name.
    it('refuses a capture directory that already holds files, before reaching the host', () => {
      const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-walk-capdir-'));
      fs.writeFileSync(path.join(workdir, 'light-orders-fresh.png'), 'an earlier run left this');

      const run = spawnSync(process.execPath, [
        driverPath(),
        '--host', 'http://127.0.0.1:1',
        '--themes', 'light',
        '--screens', 'orders:/orders:screen-orders',
        '--capdir', workdir,
        '--switcher', 'theme-switcher',
        '--theme-option', 'theme-option-{theme}',
        '--menu', 'nav-{screen}',
      ], { encoding: 'utf8', timeout: DRIVER_TIMEOUT_MS });

      expect(run.status).not.toBe(0);

      const parsed = JSON.parse(run.stdout) as { failures: { stage: string; detail: string }[] };
      expect(parsed.failures.map((failure) => failure.stage)).toEqual(['capdir']);
      expect(parsed.failures[0].detail).toContain('already holds files');
      // The earlier run's file is still there: the refusal writes nothing over it.
      expect(fs.readdirSync(workdir)).toEqual(['light-orders-fresh.png']);

      fs.rmSync(workdir, { recursive: true, force: true });
    });

    // Unvalidated, `--ready-timeout nope` made the readiness deadline NaN and
    // the poll asked every 400ms forever, printing nothing and ending never.
    // The same class reached the debugging port. Each is refused on the
    // arguments alone, before a directory exists or a browser is reached.
    it.each([
      ['--ready-timeout', 'nope'],
      ['--ready-timeout', '0'],
      ['--cdp-port', '99999'],
      ['--cdp-port', '1.5'],
      ['--command-timeout', 'soon'],
    ])('refuses %s "%s" as an arguments failure and creates nothing', (flag, value) => {
      const run = runRefusal([flag, value]);

      expect(run.status).not.toBe(0);
      expect(run.failures.map((failure) => failure.stage)).toEqual(['arguments']);
      expect(run.failures[0].detail).toContain(flag);
      expect(run.capdirExists).toBe(false);

      run.cleanup();
    });

    // Any string used to reach the walk, and everything that was not "route"
    // took the menu branch, so `--nav manu` ran a split on undefined and ended
    // the process on an uncaught TypeError with no result record at all.
    it('refuses a --nav outside the closed set', () => {
      const run = runRefusal(['--nav', 'manu']);

      expect(run.failures.map((failure) => failure.stage)).toEqual(['arguments']);
      expect(run.failures[0].detail).toContain('manu');
      expect(run.capdirExists).toBe(false);

      run.cleanup();
    });

    // A pattern that substitutes nothing clicks one same control for every theme
    // or every screen, which reads as a walk that covered all of them.
    it.each<[string, string[]]>([
      ['{theme}', ['--themes', 'light,dark', '--theme-option', 'theme-option-light']],
      ['{screen}', ['--screens', 'login:/login,tasks:/tasks', '--menu', 'nav-login']],
    ])('refuses a pattern carrying no %s placeholder when it has to vary', (token, extra) => {
      const run = runRefusal(extra);

      expect(run.failures.map((failure) => failure.stage)).toEqual(['arguments']);
      expect(run.failures[0].detail).toContain(token);

      run.cleanup();
    });

    // A declared input file that is missing, malformed, or holds the wrong shape
    // used to throw out of the top level: no result record, no coverage row, and
    // a stack trace where the run's own account of itself belongs.
    it.each<[string, string, string | null]>([
      ['--theme-registry', 'is absent', null],
      ['--theme-registry', 'is not JSON', '{ themes: [light] '],
      ['--theme-registry', 'holds a null theme list', '{ "themes": null }'],
      ['--theme-registry', 'lists something that is not a theme name', '{ "themes": [7] }'],
      ['--states', 'is absent', null],
      ['--states', 'is not JSON', '{'],
      ['--states', 'holds a non-array under a screen', '{ "orders": { "state": "submitted" } }'],
      ['--states', 'holds an action of an unknown kind', '{ "orders": [{ "state": "submitted", "actions": [{ "kind": "tap", "testid": "x" }] }] }'],
      ['--states', 'holds a fill with no value to type', '{ "orders": [{ "state": "submitted", "actions": [{ "kind": "fill", "testid": "x" }] }] }'],
      ['--states', 'names a screen the walk never visits', '{ "checkout": [] }'],
    ])('refuses a %s file that %s', (flag, _situation, content) => {
      const inputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-walk-input-'));
      const file = path.join(inputDir, 'input.json');
      if (content !== null) fs.writeFileSync(file, content);

      const run = runRefusal(flag === '--theme-registry'
        ? ['--themes', 'registry', '--theme-registry', file]
        : ['--states', file]);

      expect(run.status).not.toBe(0);
      expect(run.failures.map((failure) => failure.stage)).toEqual(['arguments']);
      expect(run.failures[0].detail).toContain(file);
      expect(run.capdirExists).toBe(false);

      fs.rmSync(inputDir, { recursive: true, force: true });
      run.cleanup();
    });

    // Reducing a name to the file-name alphabet is what keeps a traversal out of
    // the capture path, and it can map two names the invocation tells apart onto
    // one file: the second capture overwrites the first, and both coverage cells
    // go on claiming a capture of their own. Refused on the arguments, so no
    // capture is taken under a name that cannot be told from another.
    it('refuses two declared names that reduce to one capture file name', () => {
      const run = runRefusal(['--screens', 'my screen:/a:screen-login,my-screen:/b:screen-login']);

      expect(run.status).not.toBe(0);
      expect(run.failures.map((failure) => failure.stage)).toEqual(['arguments']);
      expect(run.failures[0].detail).toContain('light-my-screen-fresh.png');
      expect(run.failures[0].detail).toContain('my screen');
      expect(run.capdirExists).toBe(false);

      run.cleanup();
    });

    // A malformed argument list used to print help text on stderr, exit 2 and
    // leave stdout empty - the one shape a caller cannot act on, because it reads
    // exactly like a driver that died before it could say anything. A refusal on
    // the argument list is a refusal like every other, so it carries a record.
    it.each<[string, string[], string]>([
      ['an unknown flag', ['--nope', 'x'], 'unknown argument "--nope"'],
      ['a flag left without a value', ['--menu'], '--menu needs a value'],
    ])('records %s as an arguments failure in its result record', (_what, argv, detail) => {
      const run = runRefusal(argv);

      expect(run.status).not.toBe(0);
      expect(run.failures.map((failure) => failure.stage)).toEqual(['arguments']);
      expect(run.failures[0].detail).toBe(detail);
      expect(run.capdirExists).toBe(false);

      run.cleanup();
    });

    // The same for a required flag that is not there at all, which needs an
    // invocation the refusal helper above cannot make: it supplies every required
    // flag by construction.
    it('records a missing required flag as an arguments failure in its result record', () => {
      const capdir = path.join(os.tmpdir(), `verify-walk-missing-${process.pid}`);
      const run = spawnSync(process.execPath, [
        driverPath(),
        '--themes', 'light',
        '--screens', 'orders:/orders:screen-orders',
        '--capdir', capdir,
        '--switcher', 'theme-switcher',
        '--theme-option', 'theme-option-{theme}',
      ], { encoding: 'utf8', timeout: DRIVER_TIMEOUT_MS });

      if (run.error) throw new Error(`the driver did not return: ${run.error.message}`);
      expectResultRecord(run);

      const parsed = JSON.parse(run.stdout) as { ok: boolean; failures: { stage: string; detail: string }[] };
      expect(run.status).not.toBe(0);
      expect(parsed.ok).toBe(false);
      expect(parsed.failures.map((failure) => failure.stage)).toEqual(['arguments']);
      expect(parsed.failures[0].detail).toBe('missing required argument --host');
      // The flag surface still reaches a human, on the channel the record does not
      // use: stdout carries the record and nothing else, so a caller parsing it
      // never has to step over help text.
      expect(run.stderr).toContain('--host <url>');
      expect(fs.existsSync(capdir)).toBe(false);
    });
  });
});
