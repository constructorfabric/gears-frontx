// @vitest-environment node

/**
 * Tests for the report a failed MFE build rejects with.
 *
 * The failure this covers is a dead end rather than a wrong answer. The Module
 * Federation plugin prints `TYPE-001` for a failed type generation and keeps
 * the tsc diagnostics to itself, so the operator is left with a code, an exit
 * status, and no next step - two runs spent 30-60 s each rediscovering that
 * every MFE package carries its own `type-check` script.
 *
 * `build-mfes.ts` prints this message as-is, which is what makes it worth
 * pinning: the message is the whole failure report, so a case here asserts it
 * still carries a route to the real error rather than asserting its wording.
 */

import { describe, it, expect } from 'vitest';

import { buildFailureMessage } from '../scripts/lib/mfe-tools';

const PACKAGE_NAME = 'billing-mfe';
const PACKAGE_DIR = '/repo/src-app/mfe_packages/billing-mfe';

describe('buildFailureMessage', () => {
  it('names the package that failed and its exit code, so one red in a sequential run is attributable', () => {
    const message = buildFailureMessage(PACKAGE_NAME, 1, PACKAGE_DIR);

    expect(message).toContain(PACKAGE_NAME);
    expect(message).toContain('exit code 1');
  });

  it('carries a runnable command scoped to the failing package, which is the step TYPE-001 omits', () => {
    const message = buildFailureMessage(PACKAGE_NAME, 1, PACKAGE_DIR);

    expect(message).toContain('TYPE-001');
    expect(message).toContain(`npm run type-check --prefix ${PACKAGE_DIR}`);
  });
});
