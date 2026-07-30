// @cpt-flow:cpt-frontx-flow-ai-kit-packaging-session-availability:p1
// @cpt-state:cpt-frontx-state-ai-kit-packaging-kit-lifecycle:p1
// @cpt-dod:cpt-frontx-dod-ai-kit-packaging-install-and-activate:p1
import { describe, it, expect } from 'vitest';
import { loadKitSession, KitLifecycleState } from '../session.js';
import type { KitRegistration } from '../types.js';

const validRegistration: KitRegistration = {
  format: 'CFS',
  path: '/fake/kit/path',
  version: '0.1.0',
  source: 'npm:@gears-frontx/cyber-pilot-kit-frontx',
  install_mode: 'register',
};

// Real TOML, in the canonical `.cf-studio-kit.toml` shape. This fixture used to
// be `JSON.stringify(...)`, so `loadKitSession` was only ever exercised against
// JSON — and its `JSON.parse` call rejected every genuine manifest as malformed.
const validManifestContent = `
manifest_version = "1.0"

[[kits]]
slug = "cyber-pilot-kit-frontx"
name = "FrontX AI Tooling Kit"
version = "0.3.0-alpha.0"

[[kits.resources]]
id = "frontx_skill"
kind = "skill"
source = "SKILL.md"
install_path = "SKILL.md"
type = "file"
user_modifiable = false

[[kits.resources]]
id = "frontx_agents"
kind = "rule"
source = "AGENTS.md"
install_path = "AGENTS.md"
type = "file"
user_modifiable = false
`;

describe('KitLifecycleState', () => {
  // inst-transition-packaged-to-installed / inst-transition-installed-to-active / inst-transition-active-to-installed / inst-transition-installed-to-packaged
  it('exports all three lifecycle states', () => {
    expect(KitLifecycleState.PACKAGED).toBe('PACKAGED');
    expect(KitLifecycleState.INSTALLED).toBe('INSTALLED');
    expect(KitLifecycleState.SESSION_ACTIVE).toBe('SESSION_ACTIVE');
  });
});

describe('loadKitSession', () => {
  // inst-if-no-registration / inst-no-registration-error / inst-return-no-kit
  it('missing registration → partial-capability with diagnostic error', async () => {
    const result = await loadKitSession(null, async () => validManifestContent, async () => true);
    expect(result.state).toBe(KitLifecycleState.INSTALLED);
    expect(result.capabilities).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/not installed/i);
  });

  // inst-read-manifest / inst-invoke-validation / inst-if-manifest-invalid / inst-manifest-invalid-error / inst-return-invalid
  it('malformed manifest → partial-capability with validation errors', async () => {
    const result = await loadKitSession(
      validRegistration,
      async () => 'not-valid-toml{{{',
      async () => true,
    );
    expect(result.capabilities).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // Regression: a well-formed TOML manifest must not be reported as malformed.
  // `loadKitSession` parsed with JSON.parse, so every valid manifest failed here.
  it('well-formed TOML manifest is not reported malformed', async () => {
    const result = await loadKitSession(validRegistration, async () => validManifestContent, async () => true);
    expect(result.errors).toEqual([]);
    expect(result.state).toBe(KitLifecycleState.SESSION_ACTIVE);
  });

  // inst-session-start / inst-locate-registration / inst-read-manifest / inst-invoke-validation / inst-for-each-resource / inst-resolve-resource-path / inst-else-resource-present / inst-expose-resource / inst-return-session-active
  it('valid registration + manifest + all resources present → SESSION_ACTIVE with all capabilities', async () => {
    const result = await loadKitSession(
      validRegistration,
      async () => validManifestContent,
      async () => true,
    );
    expect(result.state).toBe(KitLifecycleState.SESSION_ACTIVE);
    expect(result.capabilities).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  // inst-resolve-resource-path — `source` and `install_path` coincide in the
  // shipped manifest, so these fixtures diverge them to pin which field each
  // install mode resolves from.
  const divergentManifestContent = `
manifest_version = "1.0"

[[kits]]
slug = "cyber-pilot-kit-frontx"
version = "0.3.0-alpha.0"

[[kits.resources]]
id = "frontx_skill"
kind = "skill"
source = "SKILL.md"
install_path = "installed/SKILL.md"
type = "file"
`;

  it('register mode resolves resources from source, not install_path', async () => {
    const probed: string[] = [];
    const result = await loadKitSession(
      { ...validRegistration, install_mode: 'register' },
      async () => divergentManifestContent,
      async (p) => {
        probed.push(p);
        return true;
      },
    );
    expect(probed).toEqual(['/fake/kit/path/SKILL.md']);
    expect(result.capabilities).toEqual([{ id: 'frontx_skill', path: '/fake/kit/path/SKILL.md', type: 'file' }]);
  });

  it('copy mode resolves resources from install_path', async () => {
    const probed: string[] = [];
    const result = await loadKitSession(
      { ...validRegistration, install_mode: 'copy' },
      async () => divergentManifestContent,
      async (p) => {
        probed.push(p);
        return true;
      },
    );
    expect(probed).toEqual(['/fake/kit/path/installed/SKILL.md']);
    expect(result.capabilities).toEqual([
      { id: 'frontx_skill', path: '/fake/kit/path/installed/SKILL.md', type: 'file' },
    ]);
  });

  // inst-if-resource-missing / inst-record-missing / inst-if-partial / inst-partial-warning
  it('one resource missing → partial-capability with warning, session still active', async () => {
    let callCount = 0;
    const result = await loadKitSession(
      validRegistration,
      async () => validManifestContent,
      async () => (callCount++ === 0 ? true : false),
    );
    expect(result.state).toBe(KitLifecycleState.SESSION_ACTIVE);
    expect(result.capabilities).toHaveLength(1);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/unavailable/i);
  });
});
