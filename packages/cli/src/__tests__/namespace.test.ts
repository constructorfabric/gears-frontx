// @cpt-flow:cpt-frontx-flow-cli-scaffolding-scaffold-project:p1
// @cpt-flow:cpt-frontx-flow-cli-scaffolding-scaffold-mfe:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-namespace-routing:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-project-scaffold:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-mfe-scaffold:p1
// @cpt-state:cpt-frontx-state-cli-scaffolding-scaffold-op:p1
// @cpt-dod:cpt-frontx-dod-cli-scaffolding-namespace-surface:p1
// @cpt-dod:cpt-frontx-dod-cli-scaffolding-project-scaffold:p1
// @cpt-dod:cpt-frontx-dod-cli-scaffolding-mfe-scaffold:p1
// TDD: Tests written before implementation. Run to see failures, then implement to pass.
import { describe, it, expect, vi } from 'vitest';
import { routeNamespaceCommand } from '../namespaces/route.js';
import { NAMESPACE_REGISTRY } from '../namespaces/types.js';
import { scaffoldProject } from '../scaffold/project.js';
import { scaffoldMfe } from '../scaffold/mfe.js';
import { ScaffoldState } from '../scaffold/state.js';
import type { InventoryEntry } from '../inventory/types.js';
import { InventoryState } from '../inventory/types.js';

// Helpers
function makeEntry(
  name: string,
  kind: 'project-template' | 'mfe-template',
  files: Array<{ path: string; content: string }> = [],
): InventoryEntry {
  const manifest = JSON.stringify({ name, version: '1.0.0', kind, files });
  return { name, source: `github:acme/${name}@v1.0.0`, ref: 'v1.0.0', status: InventoryState.INSTALLED, content: manifest };
}

const noConflict = vi.fn<[string], Promise<boolean>>().mockResolvedValue(false);
const withConflict = vi.fn<[string], Promise<boolean>>().mockResolvedValue(true);
const noWrite = vi.fn<[string, string], Promise<void>>().mockResolvedValue(undefined);

describe('NAMESPACE_REGISTRY — namespace surface (cpt-frontx-interface-cli)', () => {
  // (a) project-level and microfrontend-level namespaces are the two first-class namespaces
  // inst-match-namespace: both namespaces defined
  it('exposes project and microfrontend as the two first-class namespaces', () => {
    expect(Object.keys(NAMESPACE_REGISTRY)).toEqual(expect.arrayContaining(['project', 'microfrontend']));
    expect(Object.keys(NAMESPACE_REGISTRY)).toHaveLength(2);
  });

  // (a) both namespaces register scaffold command
  it('both namespaces register the scaffold command', () => {
    expect(NAMESPACE_REGISTRY['project']).toContain('scaffold');
    expect(NAMESPACE_REGISTRY['microfrontend']).toContain('scaffold');
  });
});

describe('routeNamespaceCommand — namespace routing algo', () => {
  // inst-case-project: project namespace routes ok
  it('routes project/scaffold successfully', () => {
    const result = routeNamespaceCommand({ namespace: 'project', command: 'scaffold', args: {} });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.namespace).toBe('project');
      expect(result.command).toBe('scaffold');
    }
  });

  // inst-case-mfe: microfrontend namespace routes ok
  it('routes microfrontend/scaffold successfully', () => {
    const result = routeNamespaceCommand({ namespace: 'microfrontend', command: 'scaffold', args: {} });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.namespace).toBe('microfrontend');
    }
  });

  // inst-default-unknown: unknown namespace fails with reason
  it('fails with unknown-namespace for unrecognized namespace label', () => {
    const result = routeNamespaceCommand({ namespace: 'unknown', command: 'scaffold', args: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unknown-namespace');
      expect(result.message).toMatch(/unrecognized namespace/i);
    }
  });

  // inst-abort-not-found: command not in namespace fails
  it('fails with command-not-found for unregistered command', () => {
    const result = routeNamespaceCommand({ namespace: 'project', command: 'delete', args: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('command-not-found');
    }
  });
});

describe('scaffoldProject — project scaffolding flow + algo', () => {
  // (b) both namespaces route through ONE shared resolver — same lookupFn
  it('uses the shared lookupFn (same resolver path as scaffoldMfe)', async () => {
    const sharedLookup = vi.fn(() => makeEntry('my-project', 'project-template'));
    await scaffoldProject('my-project', '/out', sharedLookup, noConflict, noWrite);
    // The same function reference is used — no second resolution path
    expect(sharedLookup).toHaveBeenCalledWith('my-project');
  });

  // (c) project scaffold succeeds with valid template reference and non-conflicting target dir
  // inst-return-done, inst-return-complete
  it('succeeds with a valid project-template entry and non-conflicting target', async () => {
    const entry = makeEntry('my-project', 'project-template', [
      { path: 'src/index.ts', content: 'export {};' },
    ]);
    const lookup = vi.fn(() => entry);
    const written: Array<[string, string]> = [];
    const write = vi.fn(async (p: string, c: string) => { written.push([p, c]); });
    const result = await scaffoldProject('my-project', '/out', lookup, noConflict, write);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toMatch(/scaffold complete/i);
    }
    expect(written).toEqual([['/out/src/index.ts', 'export {};']]);
  });

  // (e) scaffold aborts with notification when template reference cannot be resolved
  // inst-abort-not-found, inst-transition-req-aborted-unresolved
  it('aborts with unresolved when template reference not in local inventory', async () => {
    const lookup = vi.fn(() => undefined);
    const result = await scaffoldProject('missing', '/out', lookup, noConflict, noWrite);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unresolved');
      expect(result.message).toMatch(/not found in local inventory/i);
    }
  });

  // (f) scaffold aborts with notification when target directory contains conflicting content
  // inst-abort-conflict
  it('aborts with conflict when target directory has conflicting content', async () => {
    const lookup = vi.fn(() => makeEntry('my-project', 'project-template'));
    const result = await scaffoldProject('my-project', '/out', lookup, withConflict, noWrite);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('conflict');
      expect(result.message).toMatch(/conflicting content/i);
    }
  });

  // (g) scaffold aborts when manifest kind mismatches invoking namespace
  // inst-abort-kind-mismatch, inst-transition-resolved-aborted
  it('aborts with kind-mismatch when template is mfe-template (not project-template)', async () => {
    const lookup = vi.fn(() => makeEntry('my-mfe', 'mfe-template'));
    const result = await scaffoldProject('my-mfe', '/out', lookup, noConflict, noWrite);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('kind-mismatch');
      expect(result.message).toMatch(/kind mismatch/i);
    }
  });
});

describe('scaffoldMfe — microfrontend scaffolding flow + algo', () => {
  // (b) same shared resolver path
  it('uses the shared lookupFn (same resolver path as scaffoldProject)', async () => {
    const sharedLookup = vi.fn(() => makeEntry('my-mfe', 'mfe-template'));
    await scaffoldMfe('my-mfe', '/out', sharedLookup, noConflict, noWrite);
    expect(sharedLookup).toHaveBeenCalledWith('my-mfe');
  });

  // (d) mfe scaffold succeeds with valid mfe-template entry and non-conflicting target dir
  it('succeeds with a valid mfe-template entry and non-conflicting target', async () => {
    const entry = makeEntry('my-mfe', 'mfe-template', [
      { path: 'src/mfe.ts', content: 'export const mfe = {};' },
    ]);
    const written: Array<[string, string]> = [];
    const write = vi.fn(async (p: string, c: string) => { written.push([p, c]); });
    const result = await scaffoldMfe('my-mfe', '/out', () => entry, noConflict, write);
    expect(result.ok).toBe(true);
    expect(written).toEqual([['/out/src/mfe.ts', 'export const mfe = {};']]);
  });

  // (e) aborts when template not found
  it('aborts with unresolved when template reference not in local inventory', async () => {
    const result = await scaffoldMfe('missing', '/out', () => undefined, noConflict, noWrite);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unresolved');
    }
  });

  // (f) aborts on conflict
  it('aborts with conflict when target directory has conflicting content', async () => {
    const result = await scaffoldMfe('my-mfe', '/out', () => makeEntry('my-mfe', 'mfe-template'), withConflict, noWrite);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('conflict');
    }
  });

  // (g) aborts on kind mismatch — project-template provided to mfe namespace
  it('aborts with kind-mismatch when template is project-template (not mfe-template)', async () => {
    const result = await scaffoldMfe('my-project', '/out', () => makeEntry('my-project', 'project-template'), noConflict, noWrite);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('kind-mismatch');
    }
  });
});

describe('ScaffoldState — state machine definition', () => {
  // State machine enum values match FEATURE spec
  it('defines REQUESTED, RESOLVED, SCAFFOLDED, ABORTED states', () => {
    expect(ScaffoldState.REQUESTED).toBe('REQUESTED');
    expect(ScaffoldState.RESOLVED).toBe('RESOLVED');
    expect(ScaffoldState.SCAFFOLDED).toBe('SCAFFOLDED');
    expect(ScaffoldState.ABORTED).toBe('ABORTED');
  });
});

describe('cpt-frontx-interface-cli surface shape (h)', () => {
  // (h) the namespace boundary is implemented as part of cpt-frontx-interface-cli
  it('NAMESPACE_REGISTRY and routeNamespaceCommand are exported from the namespaces module', () => {
    expect(typeof NAMESPACE_REGISTRY).toBe('object');
    expect(typeof routeNamespaceCommand).toBe('function');
  });

  it('scaffoldProject and scaffoldMfe are exported from the scaffold module', () => {
    expect(typeof scaffoldProject).toBe('function');
    expect(typeof scaffoldMfe).toBe('function');
  });
});
