// The harness instructions an AI agent follows for `delete` (`AGENTS.md`): the
// confirming call is bound to the reviewed plan, the WHOLE projection is shown,
// and a changed plan is re-shown for a new decision. A content check of the
// instruction text, not a test of agent behaviour.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const agents = readFileSync(path.resolve(__dirname, '..', '..', 'AGENTS.md'), 'utf-8');
const protocol = agents.slice(agents.indexOf('`delete` protocol'));

describe('AGENTS.md delete protocol', () => {
  it('names every field of the projection the person must be shown', () => {
    for (const field of ['target', 'templateName', 'toDelete', 'toPreserve', 'exclusionsDrift', 'relinquishedGround', 'aiBundle', 'planDigest']) {
      expect(protocol, field).toContain(field);
    }
    expect(protocol).toContain('ALL of these fields');
  });

  it('requires the digest on the confirming call and states what a bare --yes and --dry-run do', () => {
    expect(protocol).toContain('delete <target> --json --yes --plan-digest=<details.planDigest>');
    expect(protocol).toMatch(/Without `--plan-digest`, `--yes` deletes nothing/);
    expect(protocol).toMatch(/`--dry-run` is a preview only: it issues no digest/);
  });

  it('requires re-showing the whole new plan on planChangedSinceReview and forbids automatic re-confirmation', () => {
    expect(protocol).toContain('planChangedSinceReview: true');
    expect(protocol).toContain('WHOLE new plan');
    expect(protocol).toMatch(/Never re-confirm automatically/);
  });

  it('does not promise atomicity or protection of bytes, bundle contents or symlink identity', () => {
    expect(protocol).toMatch(/does not bind file bytes/);
    expect(protocol).toMatch(/not atomic/);
    expect(protocol).not.toMatch(/\batomic(ally)? (delete|guarantee)/i);
    expect(protocol).not.toMatch(/guarantee/i);
  });
});
