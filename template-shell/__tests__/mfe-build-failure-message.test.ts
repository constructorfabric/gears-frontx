/**
 * Tests for the report a failed MFE build rejects with.
 *
 * The failure this covers is a dead end rather than a wrong answer. The Module
 * Federation plugin prints `TYPE-001` for a failed type generation and keeps the
 * tsc diagnostics to itself, so the operator is left with a code, an exit status
 * and no next step.
 *
 * `build-mfes.ts` and `dev-all.ts` both print this message as-is, which is what
 * makes it worth pinning: the message is the whole failure report, so the cases
 * here assert it still carries a route onward rather than assert its wording.
 */

import { describe, it, expect } from 'vitest';

import { buildFailureMessage } from '../scripts/lib/mfe-tools';

const PACKAGE_NAME = 'billing-mfe';
const PACKAGE_DIR = '/repo/src-app/mfe_packages/billing-mfe';

describe('buildFailureMessage', () => {
  it('names the package that failed and its exit code, so one red in a sequential run is attributable', () => {
    const message = buildFailureMessage(PACKAGE_NAME, PACKAGE_DIR, { kind: 'exit', code: 1 });

    expect(message).toContain(PACKAGE_NAME);
    expect(message).toContain('exit code 1');
  });

  it('carries a runnable command scoped to the failing package, which is the step TYPE-001 omits', () => {
    const message = buildFailureMessage(PACKAGE_NAME, PACKAGE_DIR, { kind: 'exit', code: 1 });

    expect(message).toContain('TYPE-001');
    expect(message).toContain(`npm run type-check --prefix ${PACKAGE_DIR}`);
  });

  it('reports a build that never started as an MFE build failure, carrying the spawn reason', () => {
    // A missing npx rejects with a bare `spawn ... ENOENT`, which names neither
    // the package nor the fact that an MFE build is what failed. Both entry
    // points print the rejection as their whole report, so what this shape omits
    // is all the operator gets.
    const message = buildFailureMessage(PACKAGE_NAME, PACKAGE_DIR, {
      kind: 'spawn',
      cause: new Error('spawn /repo/node_modules/.bin/npx ENOENT'),
    });

    expect(message).toContain(PACKAGE_NAME);
    expect(message).toContain('ENOENT');
    expect(message).toContain(`npm install --prefix ${PACKAGE_DIR}`);
  });

  it('does not send a build that never started chasing a type error', () => {
    // Nothing ran, so there is no output above to interpret: pointing at
    // TYPE-001 or at type-check here would be a false lead.
    const message = buildFailureMessage(PACKAGE_NAME, PACKAGE_DIR, {
      kind: 'spawn',
      cause: new Error('spawn npx ENOENT'),
    });

    expect(message).not.toContain('TYPE-001');
    expect(message).not.toContain('type-check');
  });
});
